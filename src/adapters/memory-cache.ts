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

  async function get(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace('*', '.*'))
    const matchingKeys = [...cache.keys()].filter((key) => regex.test(key))

    const validKeys = matchingKeys.filter((key) => {
      const entry = cache.get(key)
      if (entry && (!entry.expiresAt || entry.expiresAt > Date.now())) {
        return true
      } else {
        cache.delete(key)
        return false
      }
    })

    return validKeys.map((key) => key.split(':').pop()!)
  }

  async function set<T>(key: string, value: T): Promise<void> {
    const expiresAt = Date.now() + TWENTY_FOUR_HOURS_IN_MILLISECONDS
    cache.set(key, { value, expiresAt })
  }

  async function purge(key: string): Promise<void> {
    cache.delete(key)
  }

  return {
    get,
    set,
    purge,
    start,
    stop
  }
}
