import { ILRUNormalizedCache } from '../adapters/lru-cache'
import { IProfilesCacheComponent, Sync } from '../types'
import { Entity } from '@dcl/schemas'

/**
 * Rapid access in-memory cache (LRU) for most frequently accessed profiles.
 * Wraps an LRU cache with timestamp-based comparison logic.
 *
 * @export
 * @param {ILRUNormalizedCache<Sync.CacheEntry>} cache - The underlying LRU cache instance
 * @return {*}  {IProfilesCacheComponent}
 */
export function createProfilesCacheComponent(cache: ILRUNormalizedCache<Sync.CacheEntry>): IProfilesCacheComponent {
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

  function getAllPointers(): string[] {
    return cache.keys()
  }

  return {
    get,
    getMany,
    setIfNewer,
    setManyIfNewer,
    has,
    getAllPointers
  }
}
