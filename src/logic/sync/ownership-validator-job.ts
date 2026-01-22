import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents } from '../../types'
import { AvatarInfo, Entity, EntityType, EthAddress } from '@dcl/schemas'
import { Sync } from '../../types'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { interruptibleSleep, withTimeout } from '../../utils/timer'

// Timing constants
const TEN_MINUTES_MS = 10 * 60 * 1000
const TEN_SECONDS_IN_MS = 10_000

// Batch processing constants
const BATCH_SIZE = 50 // Profiles per Catalyst API call
const INTER_BATCH_DELAY_MS = 100 // Delay between batches (also yields to event loop)

type ValidatableProperties = {
  wearables: string[]
  emotes: { urn?: string; slot?: number }[]
  name?: string
  hasClaimedName?: boolean
}

export async function createOwnershipValidatorJob(
  components: Pick<
    AppComponents,
    'logs' | 'config' | 'catalyst' | 'profilesCache' | 'profileSanitizer' | 'db' | 'metrics'
  >
): Promise<IBaseComponent> {
  const { logs, config, catalyst, profilesCache, profileSanitizer, db, metrics } = components

  const VALIDATION_INTERVAL_MS = (await config.getNumber('PROFILES_OWNERSHIP_VALIDATION_INTERVAL_MS')) || TEN_MINUTES_MS
  const logger = logs.getLogger('ownership-validator-job')

  // Lifecycle state
  let running = false
  let abortController: AbortController | null = null
  let loopPromise: Promise<void> | null = null

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
    try {
      const fetchedEntities: Entity[] = await withTimeout(
        catalyst.getEntityByPointers([profilePointer]),
        TEN_SECONDS_IN_MS
      )
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
                wearables: overrides.wearables
                  ? overrides.wearables
                  : fetchedEntity.metadata.avatars[0].avatar.wearables,
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
    } catch (error: any) {
      logger.warn('Failed to fetch entity', { pointer: profilePointer, error: error.message })
      return null
    }
  }

  function updateProfileInCache(profile: Entity): void {
    const pointer = profile.pointers[0].toLowerCase()
    profilesCache.setIfNewer(pointer, profile)
  }

  function prepareDbEntity(profile: Entity): Sync.ProfileDbEntity {
    return {
      id: profile.id,
      type: EntityType.PROFILE,
      pointer: profile.pointers[0].toLowerCase(),
      timestamp: profile.timestamp,
      content: profile.content,
      metadata: profile.metadata,
      localTimestamp: Date.now()
    }
  }

  async function fetchAndUpdateProfiles(pointers: string[], abortSignal: AbortSignal): Promise<number> {
    if (pointers.length === 0 || abortSignal.aborted) {
      return 0
    }

    let fetchedProfiles: Profile[]

    try {
      // Fetch sanitized profiles from lamb2
      fetchedProfiles = await catalyst.getProfiles(pointers)
    } catch (error: any) {
      logger.error('Batch validation failed', { error: error.message })
      return 0
    }

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

    // Collect profiles that need updating for bulk DB write
    const pendingDbUpdates: Sync.ProfileDbEntity[] = []

    // Compare with current cached profiles
    for (const pointer of pointers) {
      if (abortSignal.aborted) {
        break
      }

      const cachedProfile = profilesCache.get(pointer)
      const originalProfile = cachedProfile ? profileSanitizer.mapEntitiesToProfiles([cachedProfile])[0] : null
      const sanitizedProfile = sanitizedMap.get(pointer)

      if (originalProfile && sanitizedProfile && shouldUpdateProfile(originalProfile, sanitizedProfile)) {
        logger.info('Profile update required', { pointer })

        const curatedProfile = await fetchEntityAndAdjustOwnership(pointer, {
          wearables: sanitizedProfile.avatars?.[0]?.avatar?.wearables || [],
          emotes: sanitizedProfile.avatars?.[0]?.avatar?.emotes || [],
          name: sanitizedProfile.avatars?.[0]?.name,
          hasClaimedName: sanitizedProfile.avatars?.[0]?.hasClaimedName
        })

        if (!curatedProfile) {
          logger.error('Failed to update profile with new ownership', { pointer })
          continue
        }

        // Update cache immediately (preserves existing behavior)
        updateProfileInCache(curatedProfile)

        // Collect for bulk DB write
        pendingDbUpdates.push(prepareDbEntity(curatedProfile))
      }
    }

    // Bulk write to DB at end of batch
    if (pendingDbUpdates.length > 0) {
      try {
        const updatedPointers = await db.bulkUpsertProfilesIfNewer(pendingDbUpdates)
        logger.debug('Bulk upserted profiles', {
          attempted: pendingDbUpdates.length,
          actuallyUpdated: updatedPointers.length
        })
      } catch (error: any) {
        logger.error('Failed to bulk upsert profiles', {
          error: error.message,
          profileCount: pendingDbUpdates.length
        })

        // no updates
        return 0
      }
    }

    return pendingDbUpdates.length
  }

  function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize))
    }
    return batches
  }

  async function runValidationCycle(abortSignal: AbortSignal): Promise<void> {
    const startTime = Date.now()

    // Get all pointers from hot cache
    const allPointers = profilesCache.getAllPointers()

    if (allPointers.length === 0) {
      logger.debug('No profiles in cache to validate')
      return
    }

    logger.info('Starting validation cycle', { totalProfiles: allPointers.length })

    const batches = splitIntoBatches(allPointers, BATCH_SIZE)
    let totalUpdated = 0

    for (const batch of batches) {
      if (abortSignal.aborted) break

      const profilesUpdatedCount = await fetchAndUpdateProfiles(batch, abortSignal)
      totalUpdated += profilesUpdatedCount

      // Delay between batches (also yields to event loop)
      if (!abortSignal.aborted) {
        await interruptibleSleep(INTER_BATCH_DELAY_MS, abortSignal)
      }
    }

    const durationSeconds = (Date.now() - startTime) / 1000

    // Report metrics
    metrics.observe('ownership_validation_cycle_duration_seconds', {}, durationSeconds)
    metrics.observe('ownership_validation_profiles_validated', {}, allPointers.length)
    metrics.increment('ownership_validation_profiles_updated_total', {}, totalUpdated)

    logger.info('Ownership validation cycle complete', {
      totalProfiles: allPointers.length,
      updatedProfiles: totalUpdated,
      durationSeconds: durationSeconds.toFixed(2),
      durationMinutes: (durationSeconds / 60).toFixed(2)
    })
  }

  async function validationLoop(startedFn: () => boolean, abortSignal: AbortSignal): Promise<void> {
    // Wait for all components (including pg migrations) to be ready
    logger.debug('Waiting for all components to start')
    while (!startedFn() && !abortSignal.aborted) {
      await interruptibleSleep(100, abortSignal)
    }

    if (abortSignal.aborted) {
      logger.debug('Validation loop aborted before components were ready')
      return
    }

    logger.debug('All components started, beginning validation loop')

    while (running && !abortSignal.aborted) {
      await runValidationCycle(abortSignal).catch((error) => {
        logger.error('Validation cycle failed', { error: error.message })
      })

      // Wait full interval after cycle completion
      if (!abortSignal.aborted && running) {
        await interruptibleSleep(VALIDATION_INTERVAL_MS, abortSignal)
      }
    }

    if (abortSignal.aborted) {
      logger.debug('Validation loop aborted')
    }
  }

  async function start(startOptions: IBaseComponent.ComponentStartOptions): Promise<void> {
    logger.info('Starting ownership validator', {
      intervalMs: VALIDATION_INTERVAL_MS,
      batchSize: BATCH_SIZE
    })

    running = true
    abortController = new AbortController()
    loopPromise = validationLoop(startOptions.started, abortController.signal)
  }

  async function stop(): Promise<void> {
    logger.info('Stopping ownership validator')
    running = false

    // Signal abort to stop the loop
    if (abortController) {
      abortController.abort()
    }

    // Wait for current cycle to finish
    if (loopPromise) {
      await loopPromise.catch(() => {})
    }

    logger.info('Ownership validator stopped')
  }

  return {
    start,
    stop
  }
}
