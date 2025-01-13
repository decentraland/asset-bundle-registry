import { LRUCache } from 'lru-cache'
import { ICacheStorage } from '../types'

export function createInMemoryCacheComponent(): ICacheStorage {
  const cache = new LRUCache<string, any>({
    max: 1000,
    ttl: 1000 * 60 * 60 * 2 // 2 hours
  })

  async function get(key: string): Promise<any> {
    return cache.get(key)
  }

  async function set(key: string, value: any): Promise<void> {
    cache.set(key, value)
  }

  async function purge(key: string): Promise<void> {
    cache.delete(key)
  }

  return {
    get,
    set,
    purge
  }
}
