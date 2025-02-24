// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { createRunner, createLocalFetchCompoment } from '@well-known-components/test-helpers'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { createPgComponent } from '@well-known-components/pg-component'

import { initComponents as originalInitComponents } from '../src/components'
import { metricDeclarations } from '../src/metrics'
import { TestComponents } from '../src/types'
import { main } from '../src/service'
import { createDbAdapter } from '../src/adapters/db'
import { createMessageConsumerMock } from './unit/mocks/message-consumer'
import { extendDbComponent } from './db'

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

  const messageConsumer = createMessageConsumerMock()

  return {
    ...components,
    config,
    db,
    metrics: createTestMetricsComponent(metricDeclarations),
    localFetch: await createLocalFetchCompoment(config),
    messageConsumer,
    extendedDb: extendDbComponent({ db, pg })
  }
}
