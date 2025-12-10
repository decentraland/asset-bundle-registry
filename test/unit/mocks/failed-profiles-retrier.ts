import { IFailedProfilesRetrierComponent } from '../../../src/types'

export function createFailedProfilesRetrierMockComponent(): IFailedProfilesRetrierComponent {
  return {
    retryFailedProfiles: jest.fn()
  }
}
