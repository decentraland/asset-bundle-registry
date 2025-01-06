import { workerData } from 'worker_threads'
import { AppComponents } from '../../types'

const { db, logs } = workerData.components as Pick<AppComponents, 'db' | 'logs'>
const logger = logs.getLogger('active-entities-purger-worker')

const BATCH_SIZE = 100

;(async () => {
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
      error: error?.message || 'Unknown error'
    })
  }
})()
  .then(() => logger.info('Active entities purger completed'))
  .catch(logger.error)
