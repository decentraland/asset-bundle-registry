import { DbComponent } from "../../../src/types";

export function createDbMockComponent(): DbComponent {
    return {
        getRegistriesByPointers: jest.fn(),
        getRegistryById: jest.fn(),
        insertRegistry: jest.fn(),
        upsertRegistryBundle: jest.fn(),
        getRelatedRegistries: jest.fn(),
        deleteRegistries: jest.fn(),
        getSortedRegistriesByOwner: jest.fn(),
        updateRegistriesStatus: jest.fn(),
        getBatchOfDeprecatedRegistriesOlderThan: jest.fn(),
        insertHistoricalRegistry: jest.fn(),
        getHistoricalRegistryById: jest.fn(),
        getSortedHistoricalRegistriesByOwner: jest.fn()
    }
}