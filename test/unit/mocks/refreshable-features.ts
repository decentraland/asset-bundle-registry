import { IRefreshableFeaturesComponent } from '../../../src/types'

export function createRefreshableFeaturesMockComponent(): IRefreshableFeaturesComponent {
  return {
    getMaliciousAddresses: jest.fn().mockResolvedValue(null),
    refreshFeatureFlags: jest.fn().mockResolvedValue(undefined)
  }
}
