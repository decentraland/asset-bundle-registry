import { IProfileSanitizerComponent } from '../../../src/types'

export function createProfileSanitizerMockComponent(): IProfileSanitizerComponent {
  return {
    sanitizeProfiles: jest.fn(),
    getMetadata: jest.fn(),
    getProfilesWithSnapshotsAsUrls: jest.fn(),
    mapProfilesToEntities: jest.fn()
  }
}
