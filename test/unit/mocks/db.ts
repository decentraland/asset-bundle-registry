import { IDbComponent } from '../../../src/types'

export function createDbMockComponent(): jest.Mocked<IDbComponent> {
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
    undeployRegistries: jest.fn(),
    getBatchOfDeprecatedRegistriesOlderThan: jest.fn(),
    insertHistoricalRegistry: jest.fn(),
    getSortedHistoricalRegistriesByOwner: jest.fn(),
    getHistoricalRegistryById: jest.fn(),
    upsertProfileIfNewer: jest.fn(),
    bulkUpsertProfilesIfNewer: jest.fn().mockResolvedValue([]),
    getProfileByPointer: jest.fn(),
    getProfilesByPointers: jest.fn(),
    getLatestProfileTimestamp: jest.fn(),
    markSnapshotProcessed: jest.fn(),
    isSnapshotProcessed: jest.fn(),
    insertFailedProfileFetch: jest.fn(),
    deleteFailedProfileFetch: jest.fn(),
    updateFailedProfileFetchRetry: jest.fn(),
    getFailedProfileFetches: jest.fn(),
    getFailedProfileFetchByEntityId: jest.fn()
  }
}
