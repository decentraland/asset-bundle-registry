import { EthAddress } from '@dcl/schemas/dist/misc'
import { ApplicationName } from '@well-known-components/features-component'
import { STOP_COMPONENT, START_COMPONENT } from '@well-known-components/interfaces'

import { AppComponents } from '../../types'

const FEATURE_FLAG_REFRESH_INTERVAL = 4 * 60 * 1000 // 4 minutes
const MALICIOUS_ADDRESSES_FEATURE_FLAG = 'malicious-profiles'
const USER_MODERATORS_FEATURE_FLAG = 'platform_user_moderators'

export async function createRefreshableFeaturesComponent(components: Pick<AppComponents, 'features' | 'logs'>) {
  const { features, logs } = components
  const logger = logs.getLogger('features')

  let resolveOfFirstRefresh: () => void
  let promiseOfFirstRefresh: Promise<void> = new Promise((resolve) => {
    resolveOfFirstRefresh = resolve
  })

  let maliciousAddresses: string[] | null = null
  let userModerators: string[] | null = null
  let refreshInterval: NodeJS.Timeout | null = null

  async function refreshFeatureFlags() {
    try {
      const maliciousAddressesVariant = await features.getFeatureVariant(
        ApplicationName.DAPPS,
        MALICIOUS_ADDRESSES_FEATURE_FLAG
      )

      logger.debug('Refreshed feature flags', {
        maliciousAddressesVariant: maliciousAddressesVariant?.payload?.value ?? ''
      })

      if (maliciousAddressesVariant?.payload?.value) {
        maliciousAddresses = Array.from(
          new Set(
            maliciousAddressesVariant.payload.value
              .replace(/\n/g, '')
              .split(',')
              .map((address: string) => address.toLowerCase().trim())
              .filter((address: string) => EthAddress.validate(address))
          )
        )
        logger.info('Malicious addresses updated', { count: maliciousAddresses.length })
      } else {
        maliciousAddresses = null
      }

      const userModeratorsVariant = await features.getFeatureVariant(
        ApplicationName.DAPPS,
        USER_MODERATORS_FEATURE_FLAG
      )

      logger.debug('Refreshed user moderators feature flag', {
        userModeratorsVariant: userModeratorsVariant?.payload?.value ?? ''
      })

      if (userModeratorsVariant?.payload?.value) {
        userModerators = Array.from(
          new Set(
            userModeratorsVariant.payload.value
              .replace(/\n/g, '')
              .split(',')
              .map((address: string) => address.toLowerCase().trim())
              .filter((address: string) => EthAddress.validate(address))
          )
        )
        logger.info('User moderators updated', { count: userModerators.length })
      } else {
        userModerators = null
      }
    } catch (error) {
      logger.error('Failed to refresh feature flags', {
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      promiseOfFirstRefresh = Promise.resolve()
      resolveOfFirstRefresh?.()
    }
  }

  async function start() {
    logger.info('Starting refreshable features component')
    await refreshFeatureFlags()
    refreshInterval = setInterval(async () => {
      await refreshFeatureFlags()
    }, FEATURE_FLAG_REFRESH_INTERVAL)
    logger.info('Refreshable features component started', {
      refreshInterval: FEATURE_FLAG_REFRESH_INTERVAL / 1000 / 60 + ' minutes'
    })
  }

  async function stop() {
    logger.info('Stopping refreshable features component')
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
  }

  async function getMaliciousAddresses(): Promise<string[] | null> {
    await promiseOfFirstRefresh
    return maliciousAddresses
  }

  async function getUserModerators(): Promise<string[] | null> {
    await promiseOfFirstRefresh
    return userModerators
  }

  return {
    getMaliciousAddresses,
    getUserModerators,
    refreshFeatureFlags,
    [START_COMPONENT]: start,
    [STOP_COMPONENT]: stop
  }
}
