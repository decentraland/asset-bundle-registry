import { SnapshotMetadata } from '@dcl/snapshots-fetcher/dist/types'

export function createSnapshotMetadata(overrides: Partial<SnapshotMetadata> = {}): SnapshotMetadata {
  return {
    hash: 'bafkreisnapshotdefaulthash1234567890abcdefghijklmnopqrstuv',
    timeRange: {
      initTimestamp: 1700000000000,
      endTimestamp: 1700100000000
    },
    numberOfEntities: 100,
    replacedSnapshotHashes: [],
    generationTimestamp: 1700100000000,
    ...overrides
  }
}
