import { IProfilesSynchronizerComponent } from '../../../src/types'

export function createPointerChangesHandlerMockComponent(): IProfilesSynchronizerComponent {
  return {
    syncProfiles: jest.fn()
  }
}
