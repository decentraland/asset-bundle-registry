import { Entity } from '@dcl/schemas'
import { AppComponents, IProfileSanitizerComponent, Sync } from '../../types'
import { withRetry, withTimeout } from '../../utils/async-utils'

const THIRTY_SECONDS_IN_MS = 30000

export function createProfileSanitizerComponent({
  catalyst
}: Pick<AppComponents, 'catalyst'>): IProfileSanitizerComponent {
  async function sanitizeProfiles(
    minimalProfiles: Sync.ProfileDeployment[],
    notFoundProfilesHandler: (profile: Sync.ProfileDeployment) => Promise<void>
  ): Promise<Entity[]> {
    if (minimalProfiles.length === 0) {
      return []
    }

    const entityIdsToFetch = Array.from(new Set(minimalProfiles.map((p) => p.entityId)))
    const profilesFetched = await withRetry(() =>
      withTimeout(catalyst.getEntitiesByIds(entityIdsToFetch), THIRTY_SECONDS_IN_MS)
    )

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
