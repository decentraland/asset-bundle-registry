import { LRUCache } from 'lru-cache'
import { ProfileDedupCacheComponent } from '../types'

const DEFAULT_MAX_ITEMS = 10000 // Increased for bootstrap phase
const DEFAULT_TTL_MS = 60 * 1000 // 60 seconds

export function createProfileDedupCacheComponent(
  maxItems: number = DEFAULT_MAX_ITEMS,
  ttlMs: number = DEFAULT_TTL_MS
): ProfileDedupCacheComponent {
  const cache = new LRUCache<string, boolean>({
    max: maxItems,
    ttl: ttlMs
  })

  function isDuplicate(entityId: string): boolean {
    return cache.has(entityId)
  }

  function markAsSeen(entityId: string): void {
    cache.set(entityId, true)
  }

  return {
    isDuplicate,
    markAsSeen
  }
}
