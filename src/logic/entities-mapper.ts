// import { Entity } from '@dcl/schemas'
import { AppComponents } from '../types'
// import { LRUCache } from 'lru-cache'

export async function createEntitiesMapperComponent({ logs, config }: Pick<AppComponents, 'logs' | 'config'>) {
  const ENTITIES_CACHE_SIZE = (await config.getNumber('ENTITIES_CACHE_SIZE')) || 3000
  const log = logs.getLogger('entities-mapper')

  log.debug('Setting up cache with', { cacheSize: ENTITIES_CACHE_SIZE })

  const createEntityByPointersCache = ((): Map<string, string> => {
    const normalizePointerCacheKey = (pointer: string) => pointer.toLowerCase()
    const entityIdByPointers = new Map<string, string>()
    return {
      ...entityIdByPointers,
      get(pointer: string) {
        return entityIdByPointers.get(normalizePointerCacheKey(pointer))
      },
      set(pointer: string, entity: string) {
        return entityIdByPointers.set(normalizePointerCacheKey(pointer), entity)
      },
      has(pointer: string) {
        return entityIdByPointers.has(normalizePointerCacheKey(pointer))
      },
      clear() {
        return entityIdByPointers.clear()
      }
    }
  })()

  async function getAssociatedEntityIds(pointers: string[]) {
    const uniquePointers = new Set<string>(pointers)
    const uniqueEntityIds = new Set<string>()
    const remaining: string[] = []

    for (const pointer of uniquePointers) {
      const entityId = createEntityByPointersCache.get(pointer)
      if (entityId) {
        uniqueEntityIds.add(entityId)
      } else {
        remaining.push(pointer)
      }
    }

    // once we get the ids, retrieve from cache or find
    // const entityIds = Array.from(uniqueEntityIds.values())

    // find entities for remaining pointers (we don't know the entity id), it easier to find entire entity instead of ids
    // const remainingEntities = remaining.length > 0 ? await findEntities(database, { pointers: remaining }) : []

    // return [...entitiesById, ...remainingEntities]
  }

  return { getAssociatedEntityIds }
}
