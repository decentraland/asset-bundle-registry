import { CatalystComponent } from "../../../src/types";

export function createCatalystMockComponent(): CatalystComponent {
    return {
        getEntityById: jest.fn(),
        getEntityByPointers: jest.fn(),
        getContent: jest.fn()
    }
}