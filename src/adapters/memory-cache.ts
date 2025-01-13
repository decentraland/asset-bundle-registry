import { LRUCache } from 'lru-cache'
import { ICacheStorage } from '../types'

export function createInMemoryCacheComponent(): ICacheStorage {
  const cache = new LRUCache<string, Set<string>>({
    max: 1000,
    ttl: 1000 * 60 * 60 * 2
  })

  function getOrCreateSet(key: string): Set<string> {
    let set = cache.get(key)
    if (!set) {
      set = new Set<string>()
      cache.set(key, set)
    }
    return set
  }

  async function addDeployment(key: string, entityId: string): Promise<void> {
    const set = getOrCreateSet(key)
    set.add(entityId)
    cache.set(key, set)
  }

  async function getDeployments(key: string): Promise<string[]> {
    const set = cache.get(key)
    return set ? Array.from(set) : []
  }

  async function removeDeployment(key: string, entityId: string): Promise<void> {
    const set = cache.get(key)
    if (set) {
      set.delete(entityId)
      if (set.size === 0) {
        cache.delete(key)
      } else {
        cache.set(key, set)
      }
    }
  }

  return {
    addDeployment,
    getDeployments,
    removeDeployment
  }
}
