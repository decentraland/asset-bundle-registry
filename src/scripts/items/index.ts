import { AppComponents } from '../../types'
import { readCSV } from './csv-reader'
import { sliceArray } from '../utils'
import { withRetry } from '../../utils/timer'
import { promises as fs } from 'fs'
import path from 'path'

export async function createItemsProcessor({ config, logs, fetch }: Pick<AppComponents, 'config' | 'logs' | 'fetch'>) {
  const REGISTRY_URL = await config.requireString('REGISTRY_URL')
  const REGISTRY_ADMIN_TOKEN = await config.requireString('API_ADMIN_TOKEN')
  const logger = logs.getLogger('items-processor')

  async function process(filePath: string) {
    const itemsToProcess: any[] = await readCSV(filePath)
    logger.info(`Starting to process ${itemsToProcess.length} items from ${filePath}`)

    let successCount = 0
    const failingItems: any[] = []

    for (const items of sliceArray<any>(itemsToProcess, 100)) {
      try {
        await withRetry(
          async () => {
            logger.info(`Sending batch of ${items.length} entityIds to registry...`)
            const startTime = Date.now()

            const response = await fetch.fetch(REGISTRY_URL, {
              method: 'POST',
              body: JSON.stringify({ entityIds: items.map((item) => item['entity_id']) }),
              headers: {
                Authorization: `Bearer ${REGISTRY_ADMIN_TOKEN}`
              },
              timeout: 60000 * 7 // 7 minutes
            })

            const duration = Date.now() - startTime

            if (!response.ok) {
              throw new Error(`Failed with status ${response.status}`)
            }

            successCount += items.length
            logger.info(`Called POST ${REGISTRY_URL} with batch of ${items.length} entityIds`, {
              response: response.status,
              duration: `${duration / 1000}s`,
              progress: `${successCount}/${itemsToProcess.length}`,
              failures: failingItems.length
            })
          },
          {
            logger,
            maxRetries: 3,
            baseDelay: 1000
          }
        )
      } catch (error: any) {
        logger.error(`All retries failed, won't retry again`)
        failingItems.push(...items)
      }
    }

    if (failingItems.length > 0) {
      const csvContent = ['entity_id', ...failingItems.map((item) => item['entity_id'])].join('\n')

      const originalFileName = path.basename(filePath, path.extname(filePath))
      const failuresFile = `${originalFileName}-failures.csv`

      await fs.writeFile(failuresFile, csvContent)
      logger.info(`Saved ${failingItems.length} failed items to ${failuresFile}`)
    }

    logger.info(`Processing completed`, {
      total: itemsToProcess.length,
      success: successCount,
      failures: failingItems.length,
      failuresFile: failingItems.length > 0 ? `${path.basename(filePath, path.extname(filePath))}-failures.csv` : 'N/A'
    })
  }

  return {
    process
  }
}
