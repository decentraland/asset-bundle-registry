import * as bf from 'bloom-filters'
import { AppComponents, IEntityTrackerComponent } from '../../types'
import { SimpleLRUCache } from '../../adapters/simple-lru-cache'

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
 * @param {Pick<AppComponents, 'logs'>} components
 * @param {SimpleLRUCache<boolean>} dedupCache - Injected LRU cache for short-term deduplication
 * @param {EntityTrackerConfig} [config={}]
 * @return {*}  {IEntityTrackerComponent}
 */
export function createEntityTrackerComponent(
  components: Pick<AppComponents, 'logs'>,
  dedupCache: SimpleLRUCache<boolean>,
  config: EntityTrackerConfig = {}
): IEntityTrackerComponent {
  const { logs } = components
  const logger = logs.getLogger('entity-tracker')

  const { bloomSize = DEFAULT_BLOOM_SIZE, bloomErrorRate = DEFAULT_BLOOM_ERROR_RATE } = config

  // Permanent bloom filter for tracking processed entities
  const bloomFilter = bf.BloomFilter.create(bloomSize, bloomErrorRate)

  logger.info('Entity tracker initialized', {
    bloomSize,
    bloomErrorRate
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
