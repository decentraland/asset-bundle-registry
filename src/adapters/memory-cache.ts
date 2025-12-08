import { ICacheStorage } from '../types'
import { createNormalizedLRUCache, ILRUNormalizedCache } from './lru-cache'

const FOUR_HOURS_IN_MILLISECONDS = 1000 * 60 * 60 * 4

export function createInMemoryCacheComponent(): ICacheStorage {
  const cache: ILRUNormalizedCache<{ value: any; expiresAt?: number }> = createNormalizedLRUCache<{
    value: any
    expiresAt?: number
  }>({
    maxItems: 1000,
    ttlMs: FOUR_HOURS_IN_MILLISECONDS
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

  async function set<T>(key: string, value: T): Promise<void> {
    const expiresAt = Date.now() + FOUR_HOURS_IN_MILLISECONDS
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
