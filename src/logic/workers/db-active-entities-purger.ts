import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { metricDeclarations } from '../../metrics'
import { createMetricsComponent } from '@well-known-components/metrics'
import { createPgComponent } from '@well-known-components/pg-component'
import { createDbAdapter } from '../../adapters/db'

const BATCH_SIZE = 100

async function main() {
  const config = await createDotEnvConfigComponent(
    { path: ['.env.default', '.env'] },
    {
      LOG_LEVEL: 'ALL'
    }
  )

  const logs = await createLogComponent({ config })
  const metrics = await createMetricsComponent(metricDeclarations, { config })

  let databaseUrl: string | undefined = await config.getString('PG_COMPONENT_PSQL_CONNECTION_STRING')
  if (!databaseUrl) {
    const dbUser = await config.requireString('PG_COMPONENT_PSQL_USER')
    const dbDatabaseName = await config.requireString('PG_COMPONENT_PSQL_DATABASE')
    const dbPort = await config.requireString('PG_COMPONENT_PSQL_PORT')
    const dbHost = await config.requireString('PG_COMPONENT_PSQL_HOST')
    const dbPassword = await config.requireString('PG_COMPONENT_PSQL_PASSWORD')
    databaseUrl = `postgres://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbDatabaseName}`
  }

  const pg = await createPgComponent({ logs, config, metrics })

  const db = createDbAdapter({ pg })
  const logger = logs.getLogger('db-purger-worker')

  try {
    const from = Date.now()
    const excludedRegistryIds = new Set<string>()
    let processedCount = 0

    while (true) {
      const { registries } = await db.getBatchOfDeprecatedRegistriesOlderThan(from, excludedRegistryIds, BATCH_SIZE)

      if (registries.length === 0) break

      const batchIds: string[] = []
      const failedBatchIds: string[] = []

      await Promise.all(
        registries.map(async (registry) => {
          try {
            await db.insertHistoricalRegistry(registry)
            batchIds.push(registry.id)
          } catch (error: any) {
            logger.error('Failed to migrate registry', {
              entityId: registry.id,
              error: error?.message || 'Unknown'
            })
            failedBatchIds.push(registry.id)
          }
        })
      )

      try {
        if (batchIds.length > 0) {
          await db.deleteRegistries(batchIds)
        }
      } catch (error: any) {
        logger.error('Failed to delete registries; excluding them', {
          amount: batchIds.length,
          error: error?.message || 'Unknown'
        })
        failedBatchIds.push(...batchIds)
      }

      failedBatchIds.forEach((id) => excludedRegistryIds.add(id))

      processedCount += registries.length
      logger.info(`Processed ${processedCount} registries so far.`)
    }

    logger.info(`Completed processing ${processedCount} registries.`)
  } catch (error: any) {
    logger.error('Error while migrating registries', {
      error: error?.message || 'Unknown error',
      stack: error?.stack || 'Unknown stack'
    })
  }
}

main().catch((error) => {
  console.error(error)
})
