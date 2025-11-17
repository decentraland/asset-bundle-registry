import * as bf from 'bloom-filters'
import { AppComponents, ProfileEntitiesBloomFilterComponent } from '../../types'

const DEFAULT_SIZE = 2_000_000
const DEFAULT_ERROR_RATE = 0.001

export function createProfileEntitiesBloomFilter(
  _components: Pick<AppComponents, 'logs'>,
  size: number = DEFAULT_SIZE,
  errorRate: number = DEFAULT_ERROR_RATE
): ProfileEntitiesBloomFilterComponent {
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
