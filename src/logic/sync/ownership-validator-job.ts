import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents } from '../../types'
import { AvatarInfo, Entity, EntityType, EthAddress } from '@dcl/schemas'
import { Sync } from '../../types'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

const FIVE_MINUTES_MS = 5 * 60 * 1000 // 5 minutes
const BATCH_SIZE = 50 // Process profiles in batches

type ValidatableProperties = {
  wearables: string[]
  emotes: { urn?: string; slot?: number }[]
  name?: string
  hasClaimedName?: boolean
}

export async function createOwnershipValidatorJob(
  components: Pick<AppComponents, 'logs' | 'config' | 'catalyst' | 'profilesCache' | 'profileSanitizer' | 'db'>
): Promise<IBaseComponent> {
  const { logs, config, catalyst, profilesCache, profileSanitizer, db } = components
  const logger = logs.getLogger('ownership-validator-jon')
  const VALIDATION_INTERVAL_MS =
    (await config.getNumber('PROFILES_OWNERSHIP_VALIDATION_INTERVAL_MS')) || FIVE_MINUTES_MS

  let validationInterval: NodeJS.Timeout | null = null
  let isRunning = false

  function shouldUpdateProfile(currentStoredProfile: Profile, profileFetched: Profile): boolean {
    // Different deployment - update if sanitized is newer
    if (currentStoredProfile.timestamp !== profileFetched.timestamp) {
      return profileFetched.timestamp! > currentStoredProfile.timestamp!
    }

    // Same deployment - check for ownership changes (items removed)
    const originalAvatar = currentStoredProfile.avatars?.[0]?.avatar as AvatarInfo
    const sanitizedAvatar = profileFetched.avatars?.[0]?.avatar as AvatarInfo

    if (!originalAvatar || !sanitizedAvatar) {
      return false
    }

    const originalWearables = (originalAvatar.wearables || []).map((wearable) => wearable.toLowerCase())
    const sanitizedWearables = (sanitizedAvatar.wearables || []).map((wearable) => wearable.toLowerCase())
    const originalEmotes = (originalAvatar.emotes || []).map(({ urn, slot }) => `${urn}-${slot}`.toLowerCase())
    const sanitizedEmotes = (sanitizedAvatar.emotes || []).map(({ urn, slot }) => `${urn}-${slot}`.toLowerCase())

    return (
      originalWearables.length !== sanitizedWearables.length ||
      originalEmotes.length !== sanitizedEmotes.length ||
      !originalWearables.every((wearable) => sanitizedWearables.includes(wearable)) ||
      !originalEmotes.every((emote) => sanitizedEmotes.includes(emote))
    )
  }

  async function fetchEntityAndAdjustOwnership(
    profilePointer: EthAddress,
    overrides: ValidatableProperties
  ): Promise<Entity | null> {
    const fetchedEntities: Entity[] = await catalyst.getEntityByPointers([profilePointer])
    const fetchedEntity = fetchedEntities[0]

    if (!fetchedEntity) {
      return null
    }

    return {
      ...fetchedEntity,
      metadata: {
        avatars: [
          {
            ...fetchedEntity.metadata.avatars[0],
            avatar: {
              ...fetchedEntity.metadata.avatars[0].avatar,
              // properties that require ownership validation
              wearables: overrides.wearables ? overrides.wearables : fetchedEntity.metadata.avatars[0].avatar.wearables,
              emotes: overrides.emotes ? overrides.emotes : fetchedEntity.metadata.avatars[0].avatar.emotes,
              name: overrides.name ? overrides.name : fetchedEntity.metadata.avatars[0].avatar.name,
              hasClaimedName: overrides.hasClaimedName
                ? overrides.hasClaimedName
                : fetchedEntity.metadata.avatars[0].avatar.hasClaimedName
            }
          }
        ]
      }
    } as Entity
  }

  async function updateProfileInAllLayers(profile: Entity): Promise<void> {
    const pointer = profile.pointers[0].toLowerCase()

    try {
      profilesCache.setIfNewer(pointer, profile)
      const dbProfile: Sync.ProfileDbEntity = {
        id: profile.id,
        type: EntityType.PROFILE,
        pointer: pointer,
        timestamp: profile.timestamp,
        content: profile.content,
        metadata: profile.metadata,
        localTimestamp: Date.now()
      }
      await db.upsertProfileIfNewer(dbProfile)
    } catch (error: any) {
      logger.warn('Failed to update profile in database', { pointer, error: error.message })
    }
  }

  async function validateBatch(pointers: string[]): Promise<number> {
    if (pointers.length === 0) {
      return 0
    }

    // Fetch sanitized profiles from lamb2
    const fetchedProfiles: Profile[] = await catalyst.getProfiles(pointers)

    if (fetchedProfiles.length === 0) {
      logger.warn('No profiles returned from lamb2', { requestedCount: pointers.length })
      return 0
    }

    const sanitizedMap = new Map<string, Profile>()
    for (const profile of fetchedProfiles) {
      if (!!profile.avatars?.[0]?.userId) {
        sanitizedMap.set(profile.avatars[0].userId.toLowerCase(), profile)
      }
    }

    let updatedCount = 0

    // Compare with current cached profiles
    for (const pointer of pointers) {
      const cachedProfile = profilesCache.get(pointer)
      const originalProfile = cachedProfile ? profileSanitizer.mapEntitiesToProfiles([cachedProfile])[0] : null
      const sanitizedProfile = sanitizedMap.get(pointer)

      if (originalProfile && sanitizedProfile && shouldUpdateProfile(originalProfile, sanitizedProfile)) {
        logger.info('Profile update required', {
          pointer,
          originalProfile: JSON.stringify(originalProfile),
          sanitizedProfile: JSON.stringify(sanitizedProfile)
        })

        const curatedProfile = await fetchEntityAndAdjustOwnership(pointer, {
          wearables: sanitizedProfile.avatars?.[0]?.avatar?.wearables || [],
          emotes: sanitizedProfile.avatars?.[0]?.avatar?.emotes || [],
          name: sanitizedProfile.avatars?.[0]?.name,
          hasClaimedName: sanitizedProfile.avatars?.[0]?.hasClaimedName
        })

        if (!curatedProfile) {
          logger.error('Failed to get curated profile', { pointer })
          continue
        }
        await updateProfileInAllLayers(curatedProfile)
        updatedCount++
      }
    }

    return updatedCount
  }

  async function runValidationCycle(): Promise<void> {
    if (!isRunning) {
      return
    }

    try {
      logger.debug('Ownership validation cycle started')

      // Get all pointers from hot cache (Frequently accessed profiles)
      const allPointers = profilesCache.getAllPointers()

      if (allPointers.length === 0) {
        logger.debug('No profiles found in cache to validate')
        return
      }

      let totalUpdated = 0

      // Process in batches to avoid overwhelming lamb2
      for (let i = 0; i < allPointers.length; i += BATCH_SIZE) {
        if (!isRunning) {
          break
        }

        const batch = allPointers.slice(i, i + BATCH_SIZE)
        const updated = await validateBatch(batch)
        totalUpdated += updated

        // Small delay between batches to be gentle on lamb2
        if (i + BATCH_SIZE < allPointers.length && isRunning) {
          await new Promise((resolve) => setTimeout(resolve, 100))
        }
      }

      logger.info('Ownership validation cycle complete', {
        totalProfiles: allPointers.length,
        updatedProfiles: totalUpdated
      })
    } catch (error: any) {
      logger.error('Ownership validation cycle failed', { error: error.message })
    }
  }

  async function start(): Promise<void> {
    logger.info('Ownership validator scheduled')
    isRunning = true

    // Initial delay before first validation (let sync stabilize)
    setTimeout(() => {
      if (isRunning) {
        void runValidationCycle()

        // Set up periodic validation
        validationInterval = setInterval(() => {
          void runValidationCycle()
        }, VALIDATION_INTERVAL_MS)
      }
    }, VALIDATION_INTERVAL_MS)

    logger.info('Ownership validator started', { intervalMs: VALIDATION_INTERVAL_MS })
  }

  async function stop(): Promise<void> {
    isRunning = false

    if (validationInterval) {
      clearInterval(validationInterval)
      validationInterval = null
    }

    logger.info('Ownership validator stopped')
  }

  return {
    start,
    stop
  }
}
