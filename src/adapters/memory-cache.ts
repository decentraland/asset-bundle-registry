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

  async function get<T>(pattern: string): Promise<T[]> {
    if (pattern.includes('*')) {
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

      return validKeys.map((key) => {
        const entry = cache.get(key)
        return entry?.value
      })
    }

    const entry = cache.get(pattern)
    if (!entry || (entry.expiresAt && entry.expiresAt <= Date.now())) {
      cache.delete(pattern)
      return []
    }
    return [entry.value]
  }

  async function set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttlMs = ttlSeconds ? ttlSeconds * 1000 : TWENTY_FOUR_HOURS_IN_MILLISECONDS
    const expiresAt = Date.now() + ttlMs
    cache.set(key, { value, expiresAt })
  }

  async function getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>()
    for (const key of keys) {
      const entry = cache.get(key)
      if (entry && (!entry.expiresAt || entry.expiresAt > Date.now())) {
        result.set(key, entry.value)
      } else if (entry) {
        cache.delete(key)
      }
    }
    return result
  }

  async function setMany<T>(entries: Array<{ key: string; value: T }>, ttlSeconds?: number): Promise<void> {
    const ttlMs = ttlSeconds ? ttlSeconds * 1000 : TWENTY_FOUR_HOURS_IN_MILLISECONDS
    const expiresAt = Date.now() + ttlMs
    for (const { key, value } of entries) {
      cache.set(key, { value, expiresAt })
    }
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
    getMany,
    setMany,
    purge,
    flush,
    start,
    stop
  }
}
