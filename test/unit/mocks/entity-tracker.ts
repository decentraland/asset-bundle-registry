import { IEntityTrackerComponent } from '../../../src/types'

export function createEntityTrackerMockComponent(): jest.Mocked<IEntityTrackerComponent> {
  return {
    hasBeenProcessed: jest.fn().mockReturnValue(false),
    markAsProcessed: jest.fn(),
    tryMarkDuplicate: jest.fn().mockReturnValue(false)
  }
}
