import { ICatalystComponent } from '../../../src/types'

export function createCatalystMockComponent(): ICatalystComponent {
  return {
    getEntityById: jest.fn(),
    getEntityByPointers: jest.fn(),
    getContent: jest.fn(),
    getEntitiesByIds: jest.fn(),
    getProfiles: jest.fn(),
    convertLambdasProfileToEntity: jest.fn()
  }
}
