import { LRUCache } from 'lru-cache'
import { HotProfilesCacheComponent } from '../types'
import { Profile } from '../types/profiles'

const DEFAULT_MAX_ITEMS = 10000 // Increased for bootstrap phase

export function createHotProfilesCacheComponent(maxItems: number = DEFAULT_MAX_ITEMS): HotProfilesCacheComponent {
  const cache = new LRUCache<string, Profile.CacheEntry>({
    max: maxItems
  })

  function get(pointer: string): Profile.Entity | undefined {
    const entry = cache.get(pointer.toLowerCase())
    return entry?.profile
  }

  function setIfNewer(pointer: string, profile: Profile.Entity): boolean {
    const key = pointer.toLowerCase()
    const existing = cache.get(key)

    if (existing && existing.profile.timestamp >= profile.timestamp) {
      return false
    }

    const entry: Profile.CacheEntry = {
      profile,
      localTimestamp: Date.now()
    }

    cache.set(key, entry)
    return true
  }

  function has(pointer: string): boolean {
    return cache.has(pointer.toLowerCase())
  }

  return {
    get,
    setIfNewer,
    has
  }
}
