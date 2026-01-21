import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import {
  createServerComponent,
  createStatusCheckComponent,
  instrumentHttpServerWithPromClientRegistry
} from '@dcl/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createMetricsComponent } from '@well-known-components/metrics'
import { metricDeclarations } from './metrics'
import { AppComponents, GlobalContext, Sync } from './types'
import { createPgComponent } from '@well-known-components/pg-component'
import { createDbAdapter } from './adapters/db'
import { createSqsComponent } from '@dcl/sqs-component'
import { createMemoryQueueComponent } from '@dcl/memory-queue-component'
import { createMessageProcessorComponent } from './logic/message-processor'
import { createCatalystAdapter } from './adapters/catalyst'
import { createMessagesConsumerComponent } from './logic/message-consumer'
import path from 'path'
import { createEntityStatusFetcherComponent } from './logic/entity-status-fetcher'
import { createRegistryOrchestratorComponent } from './logic/registry-orchestrator'
import { createWorkerManagerComponent } from './logic/workers/worker-manager'
import { createRedisComponent } from './adapters/redis'
import { createInMemoryCacheComponent } from './adapters/memory-cache'
import { createWorldsAdapter } from './adapters/worlds'
import { createQueuesStatusManagerComponent } from './logic/queues-status-manager'
import { createProfileSanitizerComponent } from './logic/sync/profile-sanitizer'
import { createEntityDeploymentTrackerComponent } from './logic/sync/entity-deployment-tracker'
import { createProfilesCacheComponent } from './logic/sync/profiles-cache'
import { createSnapshotContentStorage } from './logic/sync/snapshots-content-storage'
import { createNormalizedLRUCache } from './adapters/lru-cache'
import { createEntityPersisterComponent } from './logic/sync/entity-persister'
import { createProfileRetrieverComponent } from './logic/profile-retriever'
import { createFailedProfilesRetrierComponent } from './logic/sync/failed-profiles-retrier'
import { createSnapshotsHandlerComponent } from './logic/sync/snapshots-handler'
import { createPointerChangesHandlerComponent } from './logic/sync/pointer-changes-handler'
import { createSynchronizerComponent } from './logic/sync/synchronizer'
import { createOwnershipValidatorJob } from './logic/sync/ownership-validator-job'
import { createPointersComponent } from './logic/pointers'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({
    path: ['.env.default', '.env']
  })
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
  await instrumentHttpServerWithPromClientRegistry({
    server,
    metrics,
    config,
    registry: metrics.registry!
  })

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

  const pointers = createPointersComponent()
  const db = createDbAdapter({ pg, pointers })

  const sqsEndpoint = await config.getString('AWS_SQS_ENDPOINT')
  const queue = sqsEndpoint ? await createSqsComponent(config) : createMemoryQueueComponent()

  const redisHostUrl = await config.getString('REDIS_HOST')
  const memoryStorage = redisHostUrl
    ? await createRedisComponent(redisHostUrl, { logs })
    : createInMemoryCacheComponent()

  const entityDeploymentTracker = await createEntityDeploymentTrackerComponent({
    config
  })
  const profilesLRUCache = createNormalizedLRUCache<Sync.CacheEntry>({
    maxItems: (await config.getNumber('MAX_PROFILES_CACHE_SIZE')) || 1000,
    ttlMs: undefined
  })
  const profilesCache = createProfilesCacheComponent(profilesLRUCache, {
    metrics
  })
  const snapshotContentStorage = await createSnapshotContentStorage({
    logs,
    config
  })
  const catalyst = await createCatalystAdapter({ logs, fetch, config })
  const entityPersister = createEntityPersisterComponent({
    logs,
    db,
    profilesCache,
    entityDeploymentTracker
  })
  const profileRetriever = createProfileRetrieverComponent({
    logs,
    db,
    metrics,
    profilesCache,
    entityPersister,
    catalyst
  })
  const profileSanitizer = await createProfileSanitizerComponent({
    catalyst,
    config,
    logs
  })
  const snapshotsHandler = await createSnapshotsHandlerComponent({
    config,
    logs,
    fetch,
    db,
    profileSanitizer,
    entityPersister,
    snapshotContentStorage
  })
  const pointerChangesHandler = await createPointerChangesHandlerComponent({
    config,
    logs,
    fetch,
    db,
    profileSanitizer,
    entityPersister,
    entityDeploymentTracker
  })
  const failedProfilesRetrier = createFailedProfilesRetrierComponent({
    logs,
    db,
    profileSanitizer,
    entityPersister
  })
  const synchronizer = await createSynchronizerComponent({
    logs,
    config,
    entityPersister,
    db,
    snapshotsHandler,
    pointerChangesHandler,
    failedProfilesRetrier
  })
  const ownershipValidatorJob = await createOwnershipValidatorJob({
    logs,
    config,
    catalyst,
    profilesCache,
    profileSanitizer,
    db
  })
  const worlds = await createWorldsAdapter({ logs, config, fetch, pointers })
  const registryOrchestrator = createRegistryOrchestratorComponent({
    logs,
    db,
    metrics
  })
  const entityStatusFetcher = await createEntityStatusFetcherComponent({
    fetch,
    logs,
    config
  })
  const queuesStatusManager = createQueuesStatusManagerComponent({
    memoryStorage
  })
  const messageProcessor = await createMessageProcessorComponent({
    catalyst,
    worlds,
    registryOrchestrator,
    queuesStatusManager,
    db,
    logs,
    config
  })
  const messageConsumer = createMessagesConsumerComponent({
    logs,
    queue,
    messageProcessor
  })
  const workerManager = createWorkerManagerComponent({ metrics, logs })

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
    worlds,
    messageConsumer,
    registryOrchestrator,
    entityStatusFetcher,
    workerManager,
    memoryStorage,
    queuesStatusManager,
    profileRetriever,
    profileSanitizer,
    entityDeploymentTracker,
    profilesCache,
    snapshotContentStorage,
    entityPersister,
    failedProfilesRetrier,
    snapshotsHandler,
    pointerChangesHandler,
    synchronizer,
    ownershipValidatorJob,
    pointers
  }
}
