import { LRUCache } from 'lru-cache'
import { IDeploymentCacheDeduperComponent } from '../types'

const DEFAULT_MAX_ITEMS = 10000 // Increased for bootstrap phase
const DEFAULT_TTL_MS = 60 * 1000 // 60 seconds

/**
 * Short in-memory cache to deduplicate deployments of the same entity.
 *
 * @export
 * @param {number} [maxItems=DEFAULT_MAX_ITEMS]
 * @param {number} [ttlMs=DEFAULT_TTL_MS]
 * @return {*}  {IDeploymentCacheDeduperComponent}
 */
export function createDeploymentCacheDeduperComponent(
  maxItems: number = DEFAULT_MAX_ITEMS,
  ttlMs: number = DEFAULT_TTL_MS
): IDeploymentCacheDeduperComponent {
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
