import { ProfileSnapshotStorageComponent } from '../../types'

/**
 * Stub implementation for snapshot storage.
 * ABR never generates its own snapshots, so has() always returns false.
 * This is used to determine if a snapshot was locally generated (never for ABR).
 */
export function createProfileSnapshotStorage(): ProfileSnapshotStorageComponent {
  function has(_hash: string): boolean {
    return false
  }

  return {
    has
  }
}
