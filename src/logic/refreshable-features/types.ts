import { IBaseComponent } from '@well-known-components/interfaces'

export interface IRefreshableFeaturesComponent extends IBaseComponent {
  getMaliciousAddresses: () => Promise<string[] | null>
  getUserModerators: () => Promise<string[] | null>
  refreshFeatureFlags: () => Promise<void>
}
