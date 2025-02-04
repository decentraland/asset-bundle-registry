import { Entity } from '@dcl/schemas'
import { AppComponents } from '../../types'
import { sliceArray } from '../utils'
import { withRetry } from '../../utils/timer'

import fs from 'fs'

type WorldManifest = {
  empty: string[]
  occupied: string[]
  roads: string[]
}

export async function createScenesProcessor({
  config,
  logs,
  fetch,
  catalyst
}: Pick<AppComponents, 'config' | 'logs' | 'fetch' | 'catalyst'>): Promise<any> {
  const REGISTRY_URL = await config.requireString('REGISTRY_URL')
  const REGISTRY_ADMIN_TOKEN = await config.requireString('API_ADMIN_TOKEN')
  const WORLD_MANIFEST_URL = await config.requireString('WORLD_MANIFEST_URL')
  const logger = logs.getLogger('scenes-processor')

  async function fetchWorldManifest(worldManifestUrl: string): Promise<WorldManifest> {
    const response = await fetch.fetch(worldManifestUrl)
    return response.json()
  }

  async function getEntitiesByPointers(pointers: string[]): Promise<Entity[]> {
    const entities = await catalyst.getEntityByPointers(pointers)
    return entities
  }

  async function process(): Promise<any> {
    const worldManifest: WorldManifest = await fetchWorldManifest(WORLD_MANIFEST_URL)
    const scenesPointers = worldManifest.occupied

    logger.info(`Starting to process ${scenesPointers.length} scenes fetched from World Manifest`)
    const entitiesIds = new Set<string>()
    const pointersWithoutEntities = new Set<string>()
    const pointersWithEntities = new Set<string>()

    for (const batchOfPointers of sliceArray<string>(Array.from(new Set(scenesPointers)), 1000)) {
      const entities = await getEntitiesByPointers(batchOfPointers)
      entities
        .map((entity) => {
          entitiesIds.add(entity.id)
          return entity
        })
        .flat()
        .forEach((entity) => {
          entity.pointers.forEach((pointer) => {
            pointersWithEntities.add(pointer)
          })
        })

      batchOfPointers.forEach((pointer) => {
        if (!pointersWithEntities.has(pointer) && !pointersWithEntities.has(pointer.toLocaleLowerCase())) {
          pointersWithoutEntities.add(pointer)
        }
      })
    }

    if (pointersWithoutEntities.size > 0) {
      logger.warn(`Found ${pointersWithoutEntities.size} pointers without entities:`, {
        pointersWithoutEntities: JSON.stringify(Array.from(pointersWithoutEntities))
      })
    }

    for (const batchOfEntitiesIds of sliceArray<string>(Array.from(entitiesIds), 100)) {
      await withRetry(
        async () => {
          const response = await fetch.fetch(REGISTRY_URL, {
            method: 'POST',
            body: JSON.stringify({ entityIds: batchOfEntitiesIds }),
            headers: {
              Authorization: `Bearer ${REGISTRY_ADMIN_TOKEN}`
            }
          })

          if (!response.ok) {
            throw new Error(`Failed with status ${response.status}`)
          }

          logger.info(`Called POST ${REGISTRY_URL} with batch of ${batchOfEntitiesIds.length} entityIds`, {
            response: response.status
          })
        },
        {
          baseDelay: 1000,
          maxRetries: 3,
          logger
        }
      )
    }

    logger.info('Scenes processed successfully, creating file with missing pointers')
    fs.writeFileSync(
      'scenes-processor-missing-pointers.json',
      JSON.stringify(Array.from(pointersWithoutEntities), null, 2)
    )
  }

  return {
    process
  }
}
