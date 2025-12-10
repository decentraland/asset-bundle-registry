import { IEntityDeploymentTrackerComponent } from '../../../src/types'

export function createEntityDeploymentTrackerMockComponent(): IEntityDeploymentTrackerComponent {
  return {
    hasBeenProcessed: jest.fn(),
    markAsProcessed: jest.fn(),
    tryMarkDuplicate: jest.fn()
  }
}
