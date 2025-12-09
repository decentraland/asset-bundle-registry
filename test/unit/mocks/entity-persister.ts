import { IEntityPersisterComponent } from '../../../src/types'

export function createEntityPersisterMockComponent(): IEntityPersisterComponent {
  return {
    persistEntity: jest.fn(),
    setBootstrapComplete: jest.fn(),
    isBootstrapComplete: jest.fn(),
    waitForDrain: jest.fn()
  }
}
