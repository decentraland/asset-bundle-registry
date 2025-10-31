import { LRUCache } from 'lru-cache'
import { ICacheStorage } from '../types'

const TWENTY_FOUR_HOURS_IN_MILLISECONDS = 1000 * 60 * 60 * 24

export function createInMemoryCacheComponent(): ICacheStorage {
  const cache = new LRUCache<string, { value: any; expiresAt?: number }>({
    max: 1000,
    ttl: TWENTY_FOUR_HOURS_IN_MILLISECONDS
  })

  async function start() {}

  async function stop() {}

  async function get<T>(_pattern: string): Promise<T[]> {
    return []
  }

  async function set<T>(key: string, value: T): Promise<void> {
    const expiresAt = Date.now() + TWENTY_FOUR_HOURS_IN_MILLISECONDS
    cache.set(key, { value, expiresAt })
  }

  async function purge(key: string): Promise<void> {
    cache.delete(key)
  }

  async function flush(pattern: string): Promise<void> {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'))
      const matchingKeys = [...cache.keys()].filter((key) => regex.test(key))
      matchingKeys.forEach((key) => {
        cache.delete(key)
      })
    } else {
      cache.delete(pattern)
    }
  }

  return {
    get,
    set,
    purge,
    flush,
    start,
    stop
  }
}
