import * as bf from 'bloom-filters'
import { AppComponents, IEntityDeploymentTrackerComponent } from '../../types'
import { createNormalizedLRUCache } from '../../adapters/lru-cache'

const DEFAULT_BLOOM_SIZE = 2_000_000
const DEFAULT_BLOOM_ERROR_RATE = 0.001

export interface EntityTrackerConfig {
  bloomSize?: number
  bloomErrorRate?: number
}

/**
 * Unified component for tracking entity processing status.
 * Combines short-term deduplication (LRU cache) with permanent tracking (Bloom filter).
 *
 * - Short-term dedup: Prevents race conditions (injected LRU cache)
 * - Bloom filter: Provides permanent tracking with 0.1% false positive rate
 *
 * @export
 * @param {Pick<AppComponents, 'config'>} config
 * @return {*}  {Promise<EntityTrackerComponent>}
 */
export async function createEntityDeploymentTrackerComponent({
  config
}: Pick<AppComponents, 'config'>): Promise<IEntityDeploymentTrackerComponent> {
  const bloomSize = (await config.getNumber('BLOOM_SIZE')) || DEFAULT_BLOOM_SIZE
  const bloomErrorRate = (await config.getNumber('BLOOM_ERROR_RATE')) || DEFAULT_BLOOM_ERROR_RATE

  // Permanent bloom filter for tracking processed entities
  const bloomFilter = bf.BloomFilter.create(bloomSize, bloomErrorRate)
  const dedupCache = createNormalizedLRUCache<boolean>({
    maxItems: 100,
    ttlMs: 60000 // 1 minute
  })

  /**
   * Check if an entity has been processed (either in short-term cache or bloom filter)
   */
  function hasBeenProcessed(entityId: string): boolean {
    return dedupCache.has(entityId) || bloomFilter.has(entityId)
  }

  /**
   * Mark an entity as processed in both short-term cache and bloom filter
   */
  function markAsProcessed(entityId: string): void {
    dedupCache.set(entityId, true)
    bloomFilter.add(entityId)
  }

  /**
   * Attempt to mark entity as duplicate (short-term dedup only).
   * Returns true if this is a duplicate (already in dedup cache), false otherwise.
   * If not a duplicate, marks it in the dedup cache.
   */
  function tryMarkDuplicate(entityId: string): boolean {
    if (dedupCache.has(entityId)) {
      return true
    }
    dedupCache.set(entityId, true)
    return false
  }

  return {
    hasBeenProcessed,
    markAsProcessed,
    tryMarkDuplicate
  }
}
