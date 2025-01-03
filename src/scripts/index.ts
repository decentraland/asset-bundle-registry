import { initComponents } from '../components'
import { AppComponents } from '../types'
import { splitPointersInBatchOfN } from './pointers-batcher'
import { fetchWorldManifest } from './world-manifest-fetcher'
import fs from 'fs'

async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 3000,
  logger: any
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1
      if (isLastAttempt) throw error

      const delay = baseDelay * Math.pow(2, attempt) // Exponential backoff
      logger.warn('Operation failed, retrying...', {
        attempt: attempt + 1,
        delay,
        error: error?.message || 'unknown'
      })
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw new Error('Should never reach this point')
}

async function processPointers(components: AppComponents, pointers: string[]): Promise<string[]> {
  const logs = components.logs.getLogger('populate-db')
  const missingPointers: string[] = []
  const batches = splitPointersInBatchOfN(pointers, 1000)

  for (const batch of batches) {
    logs.info(`Processing batch of ${batch.length} pointers`)
    const scenesAlreadyStored = await components.db.getRegistriesByPointers(batch)
    const pointersToStore = batch.filter(
      (pointer) => !scenesAlreadyStored.some((scene) => scene.pointers.includes(pointer))
    )
    missingPointers.push(...pointersToStore)
  }

  return missingPointers
}

async function processEntities(components: AppComponents, missingPointers: string[]): Promise<any> {
  const logs = components.logs.getLogger('populate-db')
  const batches = splitPointersInBatchOfN(missingPointers, 1000)
  const entityIds = new Set<string>()
  const pointersWithoutEntities = new Set<string>()

  for (const batch of batches) {
    logs.info(`Processing batch of ${batch.length} pointers`)
    try {
      const entities = await components.catalyst.getEntityByPointers(batch)

      const pointersWithEntities = new Set(entities.map((entity) => entity.pointers).flat())
      batch.forEach((pointer) => {
        if (!pointersWithEntities.has(pointer) && !pointersWithEntities.has(pointer.toLocaleLowerCase())) {
          pointersWithoutEntities.add(pointer)
        }
      })

      entities.forEach((entity) => {
        if (entity.id) {
          entityIds.add(entity.id)
        }
      })
    } catch (error: any) {
      logs.error(`Error processing batch of ${batch.length} pointers`, { error: error?.message || 'unknown' })
    }
  }

  if (pointersWithoutEntities.size > 0) {
    logs.warn(`Found ${pointersWithoutEntities.size} pointers without entities:`, {
      pointersWithoutEntities: JSON.stringify(Array.from(pointersWithoutEntities))
    })
  }

  return {
    entityIds: Array.from(entityIds),
    pointersWithoutEntities: Array.from(pointersWithoutEntities)
  }
}

async function main() {
  const components: AppComponents = await initComponents()
  const logs = components.logs.getLogger('populate-db')
  const registryUrl = await components.config.requireString('REGISTRY_URL')
  const adminToken = await components.config.requireString('API_ADMIN_TOKEN')

  logs.info('Populating database with initial data')

  const worldManifest = await fetchWorldManifest(components)
  const missingPointers = await processPointers(components, worldManifest.occupied)

  logs.info(`Found ${missingPointers.length} missing pointers`)
  const { entityIds, pointersWithoutEntities } = await processEntities(components, missingPointers)
  logs.info(`Found ${entityIds.length} entities and ${pointersWithoutEntities.length} pointers without entities`)

  // save result in file
  fs.writeFileSync('result.json', JSON.stringify({ entityIds, pointersWithoutEntities }, null, 2))

  // Modified fetch loop with retry logic
  for (const batch of splitPointersInBatchOfN(entityIds, 100)) {
    await withRetry(
      async () => {
        const response = await fetch(registryUrl, {
          method: 'POST',
          body: JSON.stringify({ entityIds: batch }),
          headers: {
            Authorization: `Bearer ${adminToken}`
          }
        })

        if (response.status === 524 || !response.ok) {
          throw new Error(`Failed with status ${response.status}`)
        }

        logs.info(`Called POST ${registryUrl} with batch of ${batch.length} entityIds`, {
          response: response.status
        })
      },
      3,
      1000,
      logs
    )
  }
}

main().catch(console.error)
