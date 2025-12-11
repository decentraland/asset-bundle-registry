import { IProfilesSynchronizerComponent } from '../../../src/types'

export function createSnapshotsHandlerMockComponent(): IProfilesSynchronizerComponent {
  return {
    syncProfiles: jest.fn()
  }
}
