import { DbComponent } from '../../../src/types'

export function createDbMockComponent(): DbComponent {
  return {
    getSortedRegistriesByPointers: jest.fn(),
    getRegistryById: jest.fn(),
    insertRegistry: jest.fn(),
    upsertRegistryBundle: jest.fn(),
    updateRegistryVersionWithBuildDate: jest.fn(),
    getRelatedRegistries: jest.fn(),
    deleteRegistries: jest.fn(),
    getSortedRegistriesByOwner: jest.fn(),
    updateRegistriesStatus: jest.fn(),
    getBatchOfDeprecatedRegistriesOlderThan: jest.fn(),
    insertHistoricalRegistry: jest.fn(),
    getHistoricalRegistryById: jest.fn(),
    getSortedHistoricalRegistriesByOwner: jest.fn(),
    getProfileByPointer: jest.fn(),
    getProfilesByPointers: jest.fn(),
    upsertProfileIfNewer: jest.fn(),
    markSnapshotProcessed: jest.fn(),
    insertFailedProfileFetch: jest.fn(),
    getFailedProfileFetches: jest.fn(),
    getLatestProfileTimestamp: jest.fn(),
    isSnapshotProcessed: jest.fn(),
    deleteFailedProfileFetch: jest.fn(),
    updateFailedProfileFetchRetry: jest.fn(),
    getFailedProfileFetchByEntityId: jest.fn()
  }
}
