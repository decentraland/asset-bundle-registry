import { ICatalystComponent } from '../../../src/types'

export function createCatalystMockComponent(): jest.Mocked<ICatalystComponent> {
  return {
    getEntityById: jest.fn(),
    getEntityByPointers: jest.fn(),
    getContent: jest.fn(),
    getEntitiesByIds: jest.fn(),
    getProfiles: jest.fn()
  }
}
