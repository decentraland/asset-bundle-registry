import { AppComponents } from '../../types'
import { readCSV } from './csv-reader'
import { sliceArray } from '../utils'
import { withRetry } from '../../utils/timer'

export async function createItemsProcessor({ config, logs, fetch }: Pick<AppComponents, 'config' | 'logs' | 'fetch'>) {
  const REGISTRY_URL = await config.requireString('REGISTRY_URL')
  const REGISTRY_ADMIN_TOKEN = await config.requireString('API_ADMIN_TOKEN')
  const logger = logs.getLogger('items-processor')

  async function process(filePath: string) {
    const itemsToProcess: any[] = await readCSV(filePath)
    logger.info(`Starting to process ${itemsToProcess.length} items from ${filePath}`)

    for (const items of sliceArray<any>(itemsToProcess, 100)) {
      await withRetry(
        async () => {
          const response = await fetch.fetch(REGISTRY_URL, {
            method: 'POST',
            body: JSON.stringify({ entityIds: items.map((item) => item['entity_id']) }),
            headers: {
              Authorization: `Bearer ${REGISTRY_ADMIN_TOKEN}`
            }
          })

          if (!response.ok) {
            throw new Error(`Failed with status ${response.status}`)
          }

          logger.info(`Called POST ${REGISTRY_URL} with batch of ${items.length} entityIds`, {
            response: response.status
          })
        },
        {
          logger,
          maxRetries: 3,
          baseDelay: 1000
        }
      )
    }

    logger.info(`${itemsToProcess.length} items processed successfully`)
  }

  return {
    process
  }
}
