import { IEntityPersistentComponent } from '../../../src/types'

export function createEntityPersistentMockComponent(): jest.Mocked<IEntityPersistentComponent> {
  return {
    persistEntity: jest.fn().mockResolvedValue(undefined),
    setBootstrapComplete: jest.fn(),
    isBootstrapComplete: jest.fn().mockReturnValue(false),
    waitForDrain: jest.fn().mockResolvedValue(undefined)
  }
}
