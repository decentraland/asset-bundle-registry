import { DbComponent } from "../../../src/types";

export function createDbMockComponent(): DbComponent {
    return {
        getRegistriesByPointers: jest.fn(),
        getRegistryById: jest.fn(),
        insertRegistry: jest.fn(),
        updateRegistryStatus: jest.fn(),
        upsertRegistryBundle: jest.fn(),
        getRelatedRegistries: jest.fn(),
        deleteRegistries: jest.fn()
    }
}