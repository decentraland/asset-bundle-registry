import { Entity, EntityType, Profile } from '@dcl/schemas'
import { AppComponents, IProfileSanitizerComponent, Sync, ProfileMetadata } from '../../types'
import { withRetry, withTimeout } from '../../utils/timer'

const THIRTY_SECONDS_IN_MS = 30000

export async function createProfileSanitizerComponent({
  catalyst,
  config
}: Pick<AppComponents, 'catalyst' | 'config'>): Promise<IProfileSanitizerComponent> {
  const PROFILES_IMAGE_URL = await config.requireString('PROFILES_IMAGE_URL')

  async function sanitizeProfiles(
    minimalProfiles: Sync.ProfileDeployment[],
    notFoundProfilesHandler: (profile: Sync.ProfileDeployment | Sync.FailedProfileDbEntity) => Promise<void>
  ): Promise<Entity[]> {
    if (minimalProfiles.length === 0) {
      return []
    }

    const entityIdsToFetch = Array.from(new Set(minimalProfiles.map((p) => p.entityId)))
    const profilesFetched = await withRetry(() =>
      withTimeout(catalyst.getEntitiesByIds(entityIdsToFetch), THIRTY_SECONDS_IN_MS)
    )

    const missingProfiles = minimalProfiles.filter((p) => !profilesFetched.some((pf) => pf.id === p.entityId))
    for (const missingProfile of missingProfiles) {
      await notFoundProfilesHandler(missingProfile)
    }

    return profilesFetched as Entity[]
  }

  function buildProfilesSnapshots(entityId: string): { body: string; face: string } {
    return {
      body: `${PROFILES_IMAGE_URL}/entities/${entityId}/body.png`,
      face: `${PROFILES_IMAGE_URL}/entities/${entityId}/face.png`
    }
  }

  function getMetadata(profile: Entity): ProfileMetadata {
    const avatar = (profile.metadata as Profile).avatars[0]
    return {
      pointer: profile.pointers[0],
      hasClaimedName: avatar.hasClaimedName,
      name: avatar.name,
      thumbnailUrl: buildProfilesSnapshots(profile.id).face
    }
  }

  function getProfilesWithSnapshotsAsUrls(profiles: Entity[]): Entity[] {
    return profiles.map((profile) => {
      const snapshots = buildProfilesSnapshots(profile.id)
      const metadata = profile.metadata as Profile

      return {
        ...profile,
        metadata: {
          ...metadata,
          avatars: metadata.avatars.map((avatar) => {
            if (avatar.avatar) {
              return {
                ...avatar,
                avatar: {
                  ...avatar.avatar,
                  snapshots: {
                    face256: snapshots.face,
                    body: snapshots.body
                  }
                }
              }
            }
            return avatar
          })
        }
      }
    })
  }

  function mapProfilesToEntities(profiles: Profile[]): Entity[] {
    return profiles.map((profile) => {
      const avatar = profile.avatars![0]
      const ethAddress = avatar.ethAddress as string
      return {
        version: 'v3' as const,
        id: ethAddress,
        type: EntityType.PROFILE,
        pointers: [ethAddress.toLowerCase()],
        timestamp: avatar.version || Date.now(),
        content: [],
        metadata: {
          avatars: profile.avatars
        }
      }
    })
  }

  return {
    sanitizeProfiles,
    getMetadata,
    getProfilesWithSnapshotsAsUrls,
    mapProfilesToEntities
  }
}
