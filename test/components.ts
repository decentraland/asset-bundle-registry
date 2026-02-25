// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { createRunner, createLocalFetchCompoment } from '@well-known-components/test-helpers'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { createPgComponent } from '@dcl/pg-component'

import { initComponents as originalInitComponents } from '../src/components'
import { metricDeclarations } from '../src/metrics'
import { TestComponents } from '../src/types'
import { main } from '../src/service'
import { createDbAdapter } from '../src/adapters/db'
import { extendDbComponent } from './db'
import { createMessageConsumerMockComponent } from './unit/mocks/message-consumer'
import { createMessageProcessorComponent } from '../src/logic/message-processor'
import { createRegistryComponent } from '../src/logic/registry'
import { createCoordinatesComponent } from '../src/logic/coordinates'
import { createQueuesStatusManagerComponent } from '../src/logic/queues-status-manager'
import { createInMemoryCacheComponent } from '../src/adapters/memory-cache'
import { createWorldsMockComponent } from './unit/mocks/worlds'
import { INatsComponent } from '@well-known-components/nats-component/dist/types'

/**
 * Behaves like Jest "describe" function, used to describe a test for a
 * use case, it creates a whole new program and components to run an
 * isolated test.
 *
 * State is persistent within the steps of the test.
 */
export const test = createRunner<TestComponents>({
  main,
  initComponents
})

async function initComponents(): Promise<TestComponents> {
  const components = await originalInitComponents()

  const config = await createDotEnvConfigComponent({ path: ['.env.test'] })

  let databaseUrl: string | undefined = await config.getString('PG_COMPONENT_PSQL_CONNECTION_STRING')
  if (!databaseUrl) {
    const dbUser = await config.requireString('PG_COMPONENT_PSQL_USER')
    const dbDatabaseName = await config.requireString('PG_COMPONENT_PSQL_DATABASE')
    const dbPort = await config.requireString('PG_COMPONENT_PSQL_PORT')
    const dbHost = await config.requireString('PG_COMPONENT_PSQL_HOST')
    const dbPassword = await config.requireString('PG_COMPONENT_PSQL_PASSWORD')
    databaseUrl = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabaseName}`
  }
  // This worker writes to the database, so it runs the migrations
  const pg = await createPgComponent(components)

  const db = createDbAdapter({ pg })
  const logs = components.logs
  const metrics = createTestMetricsComponent(metricDeclarations)

  // Create coordinates component
  const coordinates = createCoordinatesComponent({ db, logs })

  // Create registry component
  const registry = createRegistryComponent({ logs, db, metrics, coordinates })

  // Create mocks for components not needed in integration tests
  const worlds = createWorldsMockComponent()
  const memoryStorage = createInMemoryCacheComponent()
  const queuesStatusManager = createQueuesStatusManagerComponent({ memoryStorage })

  // Create a mock NATS component for tests
  const nats: INatsComponent = {
    publish: () => {},
    subscribe: () => ({ unsubscribe: () => {} }),
    start: async () => {},
    stop: async () => {}
  } as unknown as INatsComponent

  // Create message processor for integration tests
  // Uses the real catalyst from originalInitComponents() so that jest.spyOn works
  // consistently for both HTTP handler tests and message processor tests.
  const messageProcessor = await createMessageProcessorComponent({
    catalyst: components.catalyst,
    worlds,
    registry,
    queuesStatusManager,
    coordinates,
    db,
    logs,
    config,
    nats
  })

  const messageConsumer = createMessageConsumerMockComponent()

  return {
    ...components,
    config,
    db,
    worlds,
    coordinates,
    registry,
    metrics,
    nats,
    localFetch: await createLocalFetchCompoment(config),
    messageConsumer,
    messageProcessor,
    extendedDb: extendDbComponent({ db, pg })
  }
}
