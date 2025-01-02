import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import {
  createServerComponent,
  createStatusCheckComponent,
  instrumentHttpServerWithPromClientRegistry
} from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createMetricsComponent } from '@well-known-components/metrics'
import { metricDeclarations } from './metrics'
import { AppComponents, GlobalContext } from './types'
import { createPgComponent } from '@well-known-components/pg-component'
import { createDbAdapter } from './adapters/db'
import { createSqsAdapter } from './adapters/sqs'
import { createMemoryQueueAdapter } from './adapters/memory-queue'
import { createMessageProcessorComponent } from './logic/message-processor'
import { createCatalystAdapter } from './adapters/catalyst'
import { createMessagesConsumerComponent } from './logic/message-consumer'
import path from 'path'
import { createEntityStatusFetcherComponent } from './logic/entity-status-fetcher'
import { createRegistryOrchestratorComponent } from './logic/registry-orchestrator'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent(
    { path: ['.env.default', '.env'] },
    {
      LOG_LEVEL: 'ALL'
    }
  )
  const logs = await createLogComponent({ config })

  const logger = logs.getLogger('components')
  const commitHash = (await config.getString('COMMIT_HASH')) || 'unknown'
  logger.info(`Initializing components. Version: ${commitHash}`)

  const server = await createServerComponent<GlobalContext>(
    { config, logs },
    {
      cors: {
        methods: ['GET', 'HEAD', 'OPTIONS', 'DELETE', 'POST', 'PUT'],
        maxAge: 86400
      }
    }
  )

  const statusChecks = await createStatusCheckComponent({ server, config })
  const fetch = createFetchComponent()
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  await instrumentHttpServerWithPromClientRegistry({ server, metrics, config, registry: metrics.registry! })

  let databaseUrl: string | undefined = await config.getString('PG_COMPONENT_PSQL_CONNECTION_STRING')
  if (!databaseUrl) {
    const dbUser = await config.requireString('PG_COMPONENT_PSQL_USER')
    const dbDatabaseName = await config.requireString('PG_COMPONENT_PSQL_DATABASE')
    const dbPort = await config.requireString('PG_COMPONENT_PSQL_PORT')
    const dbHost = await config.requireString('PG_COMPONENT_PSQL_HOST')
    const dbPassword = await config.requireString('PG_COMPONENT_PSQL_PASSWORD')
    databaseUrl = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabaseName}`
  }

  const pg = await createPgComponent(
    { logs, config, metrics },
    {
      migration: {
        databaseUrl,
        dir: path.resolve(__dirname, 'migrations'),
        migrationsTable: 'pgmigrations',
        ignorePattern: '.*\\.map',
        direction: 'up'
      }
    }
  )

  const db = createDbAdapter({ pg })

  const sqsEndpoint = await config.getString('AWS_SQS_ENDPOINT')
  const queue = sqsEndpoint ? await createSqsAdapter(sqsEndpoint) : createMemoryQueueAdapter()
  const catalyst = await createCatalystAdapter({ logs, fetch, config })
  const registryOrchestrator = await createRegistryOrchestratorComponent({ logs, db })
  const entityStatusFetcher = await createEntityStatusFetcherComponent({ fetch, logs, config })
  const messageProcessor = await createMessageProcessorComponent({
    catalyst,
    entityStatusFetcher,
    registryOrchestrator,
    logs,
    db
  })
  const messageConsumer = createMessagesConsumerComponent({ logs, queue, messageProcessor, metrics })

  return {
    config,
    fetch,
    logs,
    metrics,
    server,
    statusChecks,
    pg,
    db,
    queue,
    messageProcessor,
    catalyst,
    messageConsumer,
    registryOrchestrator,
    entityStatusFetcher
  }
}
