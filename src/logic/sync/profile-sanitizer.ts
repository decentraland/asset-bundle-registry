import { Entity } from '@dcl/schemas'
import { AppComponents, IProfileSanitizerComponent, Sync } from '../../types'
import { withRetry, withTimeout } from '../../utils/async-utils'

const THIRTY_SECONDS_IN_MS = 30000

export function createProfileSanitizerComponent({
  catalyst,
  logs
}: Pick<AppComponents, 'catalyst' | 'logs'>): IProfileSanitizerComponent {
  const logger = logs.getLogger('profile-sanitizer')

  async function sanitizeProfiles(
    minimalProfiles: Sync.ProfileDeployment[],
    notFoundProfilesHandler: (profile: Sync.ProfileDeployment | Sync.FailedProfileFetch) => Promise<void>
  ): Promise<Entity[]> {
    if (minimalProfiles.length === 0) {
      return []
    }

    const entityIdsToFetch = Array.from(new Set(minimalProfiles.map((p) => p.entityId)))
    const profilesFetched = await withRetry(() =>
      withTimeout(catalyst.getEntitiesByIds(entityIdsToFetch), THIRTY_SECONDS_IN_MS)
    )

    if (profilesFetched.length === 0 || profilesFetched.length !== entityIdsToFetch.length) {
      logger.error('Profiles fetched mismatch', {
        requested: entityIdsToFetch.length,
        fetched: profilesFetched.length
      })

      for (const minimalProfile of minimalProfiles) {
        await notFoundProfilesHandler(minimalProfile)
      }

      return []
    }

    for (const minimalProfile of minimalProfiles) {
      const profile = profilesFetched.find((p) => p.id === minimalProfile.entityId)
      if (!profile) {
        await notFoundProfilesHandler(minimalProfile)
      }
    }

    return profilesFetched as Entity[]
  }

  return {
    sanitizeProfiles
  }
}
