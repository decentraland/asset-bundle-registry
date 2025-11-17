import PQueue from 'p-queue'
import { AppComponents, ProfileDeployerComponent } from '../../types'
import { Profile } from '../../types/profiles'

const DB_PERSISTENCE_CONCURRENCY = 30

export function createProfileDeployer(
  components: Pick<
    AppComponents,
    'logs' | 'profilesDb' | 'hotProfilesCache' | 'profileDedupCache' | 'profileEntitiesBloomFilter'
  >
): ProfileDeployerComponent {
  const { logs, profilesDb, hotProfilesCache, profileDedupCache, profileEntitiesBloomFilter } = components
  const logger = logs.getLogger('profile-deployer')

  let bootstrapComplete = false

  const dbPersistenceQueue = new PQueue({ concurrency: DB_PERSISTENCE_CONCURRENCY })

  async function deployProfile(entity: Profile.Entity): Promise<void> {
    // Check dedup cache first (fast in-memory check)
    if (profileDedupCache.isDuplicate(entity.id)) {
      return
    }

    // Mark as seen in dedup cache
    profileDedupCache.markAsSeen(entity.id)

    // Check bloom filter for already processed entities
    if (profileEntitiesBloomFilter.has(entity.id)) {
      return
    }

    // Add to bloom filter
    profileEntitiesBloomFilter.add(entity.id)

    // Update hot cache (only if newer)
    const cacheUpdated = hotProfilesCache.setIfNewer(entity.pointer, entity)

    if (!cacheUpdated) {
      return
    }

    // Persist to database
    const dbEntity: Profile.DbEntity = {
      ...entity,
      localTimestamp: Date.now()
    }

    if (bootstrapComplete) {
      // During incremental sync: persist directly (already cached)
      profilesDb.upsertProfileIfNewer(dbEntity).catch((error) => {
        logger.error('Failed to persist profile to database', {
          entityId: entity.id,
          pointer: entity.pointer,
          error: error.message
        })
      })
    } else {
      // During bootstrap: queue for controlled concurrency
      dbPersistenceQueue
        .add(() => profilesDb.upsertProfileIfNewer(dbEntity))
        .catch((error) => {
          logger.error('Failed to queue profile persistence', {
            entityId: entity.id,
            pointer: entity.pointer,
            error: error.message
          })
        })
    }
  }

  function setBootstrapComplete(): void {
    bootstrapComplete = true
    logger.info('Bootstrap complete, switching to direct DB persistence')
  }

  function isBootstrapComplete(): boolean {
    return bootstrapComplete
  }

  async function waitForDrain(): Promise<void> {
    await dbPersistenceQueue.onIdle()
    logger.info('DB persistence queue drained')
  }

  return {
    deployProfile,
    setBootstrapComplete,
    isBootstrapComplete,
    waitForDrain
  }
}
