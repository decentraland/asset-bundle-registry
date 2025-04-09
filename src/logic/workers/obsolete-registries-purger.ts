import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { metricDeclarations } from '../../metrics'
import { createMetricsComponent } from '@well-known-components/metrics'
import { createPgComponent } from '@well-known-components/pg-component'
import { createDbAdapter } from '../../adapters/db'
import { SQL } from 'sql-template-strings'

const BATCH_SIZE = 100

async function getComponents() {
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

  return { metrics, pg, db, logger }
}

async function main() {
  const { metrics, pg, db, logger } = await getComponents()

  async function purgeObsoleteRegistries() {
    const from = Date.now()
    const excludedRegistryIds = new Set<string>()
    let processedCount = 0

    while (true) {
      const { registries } = await db.getBatchOfDeprecatedRegistriesOlderThan(from, excludedRegistryIds, BATCH_SIZE)

      if (registries.length === 0) break

      const batchIds: string[] = []
      const failedBatchIds: string[] = []

      await Promise.all(
        registries.map(async (registry: any) => {
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
          metrics.increment('registries_purge_count', {}, batchIds.length)
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
  }

  try {
    logger.info('Running ANALYZE before purging registries...')
    await pg.query(SQL`ANALYZE`)
    await purgeObsoleteRegistries()
    await pg.query(SQL`VACUUM ANALYZE`)
  } catch (error: any) {
    logger.error('Error during worker execution:', {
      message: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace available'
    })
  }
}

main().catch((error) => {
  console.error(error)
})
