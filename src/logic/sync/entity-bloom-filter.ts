import * as bf from 'bloom-filters'
import { AppComponents, IEntityBloomFilterComponent } from '../../types'

const DEFAULT_SIZE = 2_000_000
const DEFAULT_ERROR_RATE = 0.001

/**
 * Component in charge of tracking entities that have been processed.
 * Uses a bloom filter to track entities that have been processed.
 *
 * @export
 * @param {Pick<AppComponents, 'logs'>} _components
 * @param {number} [size=DEFAULT_SIZE]
 * @param {number} [errorRate=DEFAULT_ERROR_RATE]
 * @return {*}  {IEntityBloomFilterComponent}
 */
export function createEntityBloomFilterComponent(
  _components: Pick<AppComponents, 'logs'>,
  size: number = DEFAULT_SIZE,
  errorRate: number = DEFAULT_ERROR_RATE
): IEntityBloomFilterComponent {
  const bloomFilter = bf.BloomFilter.create(size, errorRate)

  function add(entityId: string): void {
    bloomFilter.add(entityId)
  }

  function has(entityId: string): boolean {
    return bloomFilter.has(entityId)
  }

  return {
    add,
    has
  }
}
