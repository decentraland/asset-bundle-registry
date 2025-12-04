import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents } from '../../types'
import { Entity, EntityType } from '@dcl/schemas'
import { Sync } from '../../types'

const VALIDATION_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const BATCH_SIZE = 50 // Process profiles in batches

export function createOwnershipValidatorJob(
  components: Pick<AppComponents, 'logs' | 'catalyst' | 'hotProfilesCache' | 'db'>
): IBaseComponent {
  const { logs, catalyst, hotProfilesCache, db } = components
  const logger = logs.getLogger('ownership-validator')

  let validationInterval: NodeJS.Timeout | null = null
  let isRunning = false

  function shouldUpdateProfile(original: Entity, sanitized: Entity): boolean {
    // Different deployment - update if sanitized is newer
    if (original.id !== sanitized.id) {
      return sanitized.timestamp > original.timestamp
    }

    // Same deployment - check for ownership changes (items removed)
    const originalMetadata = original.metadata as any
    const sanitizedMetadata = sanitized.metadata as any

    if (!originalMetadata || !sanitizedMetadata) {
      return false
    }

    const originalAvatar = originalMetadata.avatars?.[0]
    const sanitizedAvatar = sanitizedMetadata.avatars?.[0]

    if (!originalAvatar || !sanitizedAvatar) {
      return false
    }

    const originalWearables = originalAvatar.avatar?.wearables || []
    const sanitizedWearables = sanitizedAvatar.avatar?.wearables || []
    const originalEmotes = originalAvatar.avatar?.emotes || []
    const sanitizedEmotes = sanitizedAvatar.avatar?.emotes || []

    return originalWearables.length !== sanitizedWearables.length || originalEmotes.length !== sanitizedEmotes.length
  }

  async function updateProfileInAllLayers(profile: Entity): Promise<void> {
    const pointer = profile.pointers[0].toLowerCase()

    hotProfilesCache.setIfNewer(pointer, profile)

    try {
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
    const sanitizedProfiles = await catalyst.getSanitizedProfiles(pointers)

    if (sanitizedProfiles.length === 0) {
      logger.warn('No profiles returned from lamb2', { requestedCount: pointers.length })
      return 0
    }

    if (sanitizedProfiles.length < pointers.length) {
      logger.warn('Partial response from lamb2', {
        requested: pointers.length,
        received: sanitizedProfiles.length
      })
    }

    // Create a map for quick lookup
    const sanitizedMap = new Map<string, Entity>()
    for (const profile of sanitizedProfiles) {
      if (profile.pointers.length > 0) {
        sanitizedMap.set(profile.pointers[0].toLowerCase(), profile)
      }
    }

    let updatedCount = 0

    // Compare with current hot cache profiles
    for (const pointer of pointers) {
      const originalProfile = hotProfilesCache.get(pointer)
      const sanitizedProfile = sanitizedMap.get(pointer)

      if (originalProfile && sanitizedProfile) {
        if (shouldUpdateProfile(originalProfile, sanitizedProfile)) {
          logger.info('Profile update required', {
            pointer,
            originalEntityId: originalProfile.id,
            sanitizedEntityId: sanitizedProfile.id,
            sameDeployment: String(originalProfile.id === sanitizedProfile.id)
          })

          await updateProfileInAllLayers(sanitizedProfile)
          updatedCount++
        }
      }
    }

    return updatedCount
  }

  async function runValidationCycle(): Promise<void> {
    if (!isRunning) {
      return
    }

    try {
      logger.debug('Starting ownership validation cycle')

      // Get all pointers from hot cache
      const allPointers = hotProfilesCache.getAllPointers()

      if (allPointers.length === 0) {
        logger.debug('No profiles in hot cache to validate')
        return
      }

      logger.info('Validating profile ownership', { totalProfiles: allPointers.length })

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
      logger.error('Error during ownership validation cycle', { error: error.message })
    }
  }

  async function start(): Promise<void> {
    logger.info('Starting ownership validator')
    isRunning = true

    // Initial delay before first validation (let sync stabilize)
    setTimeout(() => {
      if (isRunning) {
        runValidationCycle().catch((error) => {
          logger.error('Error in initial validation cycle', { error: error.message })
        })

        // Set up periodic validation
        validationInterval = setInterval(() => {
          runValidationCycle().catch((error) => {
            logger.error('Error in validation cycle', { error: error.message })
          })
        }, VALIDATION_INTERVAL_MS)
      }
    }, VALIDATION_INTERVAL_MS)

    logger.info('Ownership validator started', { intervalMs: VALIDATION_INTERVAL_MS })
  }

  async function stop(): Promise<void> {
    logger.info('Stopping ownership validator')
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
