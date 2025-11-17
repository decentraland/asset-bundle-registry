import { LRUCache } from 'lru-cache'
import { IHotProfilesCacheComponent, Sync } from '../types'
import { Entity } from '@dcl/schemas'

const DEFAULT_MAX_ITEMS = 10000 // Increased for bootstrap phase
/**
 * Rapid access in-memory cache (LRU) for most frequently accessed profiles.
 *
 * @export
 * @param {number} [maxItems=DEFAULT_MAX_ITEMS]
 * @return {*}  {IHotProfilesCacheComponent}
 */
export function createHotProfilesCacheComponent(maxItems: number = DEFAULT_MAX_ITEMS): IHotProfilesCacheComponent {
  const cache = new LRUCache<string, Sync.CacheEntry>({
    max: maxItems
  })

  function get(pointer: string): Entity | undefined {
    const entry = cache.get(pointer.toLowerCase())
    return entry?.profile
  }

  function getMany(pointers: string[]): Map<string, Entity> {
    const results = new Map<string, Entity>()
    for (const pointer of pointers) {
      const normalizedPointer = pointer.toLowerCase()
      const entry = cache.get(normalizedPointer)
      if (entry) {
        results.set(normalizedPointer, entry.profile)
      }
    }
    return results
  }

  /**
   * Set a profile in the hot cache if it is newer than the existing one.
   * Returns false if the profile is not newer than the existing one.
   *
   * @param {string} pointer
   * @param {Entity} profile
   * @return {*}  {boolean}
   */
  function setIfNewer(pointer: string, profile: Entity): boolean {
    const key = pointer.toLowerCase()
    const existing = cache.get(key)

    if (existing && existing.profile.timestamp >= profile.timestamp) {
      return false
    }

    const entry: Sync.CacheEntry = {
      profile,
      localTimestamp: Date.now()
    }

    cache.set(key, entry)
    return true
  }

  function setManyIfNewer(profiles: Entity[]): void {
    for (const profile of profiles) {
      if (profile.pointers.length > 0) {
        setIfNewer(profile.pointers[0], profile)
      }
    }
  }

  function has(pointer: string): boolean {
    return cache.has(pointer.toLowerCase())
  }

  return {
    get,
    getMany,
    setIfNewer,
    setManyIfNewer,
    has
  }
}
