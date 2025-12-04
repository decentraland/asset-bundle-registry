import { Entity, Profile } from '@dcl/schemas'
import { AppComponents, IProfileSanitizerComponent, Sync, ProfileMetadata } from '../../types'
import { withRetry, withTimeout } from '../../utils/async-utils'

const THIRTY_SECONDS_IN_MS = 30000

export async function createProfileSanitizerComponent({
  catalyst,
  config,
  logs
}: Pick<AppComponents, 'catalyst' | 'config' | 'logs'>): Promise<IProfileSanitizerComponent> {
  const logger = logs.getLogger('profile-sanitizer')
  const PROFILES_IMAGE_URL = await config.requireString('PROFILES_IMAGE_URL')

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
      logger.warn('Profiles fetched mismatch', {
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

  function getMetadata(profile: Entity): ProfileMetadata {
    const avatar = (profile.metadata as Profile).avatars[0]
    return {
      pointer: profile.pointers[0],
      hasClaimedName: avatar.hasClaimedName,
      name: avatar.name,
      thumbnailUrl: `${PROFILES_IMAGE_URL}/entities/${profile.id}/face.png`
    }
  }

  return {
    sanitizeProfiles,
    getMetadata
  }
}
