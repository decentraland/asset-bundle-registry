import PQueue from 'p-queue'
import { AppComponents, IEntityPersistentComponent } from '../../types'
import { Sync } from '../../types'
import { Entity } from '@dcl/schemas'

const DB_PERSISTENCE_CONCURRENCY = 30

/**
 * Component in charge of persisting entities to the different data stores (caches and database).
 * Handles persistence of entities in the hot cache, dedup cache, bloom filter and database.
 *
 * @export
 * @param {(Pick<
 *     AppComponents,
 *     'logs' | 'profilesDb' | 'hotProfilesCache' | 'deploymentCacheDeduper' | 'entityBloomFilter'
 *   >)} components
 * @return {*}  {IEntityPersistentComponent}
 */
export function createEntityPersistentComponent(
  components: Pick<AppComponents, 'logs' | 'db' | 'hotProfilesCache' | 'deploymentCacheDeduper' | 'entityBloomFilter'>
): IEntityPersistentComponent {
  const { logs, db, hotProfilesCache, deploymentCacheDeduper, entityBloomFilter } = components
  const logger = logs.getLogger('entity-persistent')

  let bootstrapComplete = false

  const dbPersistenceQueue = new PQueue({ concurrency: DB_PERSISTENCE_CONCURRENCY })

  async function persistEntity(entity: Entity): Promise<void> {
    // prevent race-condition duplicates
    if (deploymentCacheDeduper.isDuplicate(entity.id)) {
      return
    } else {
      deploymentCacheDeduper.markAsSeen(entity.id)
    }

    // prevent persisting entities that have already been processed
    if (entityBloomFilter.has(entity.id)) {
      return
    } else {
      entityBloomFilter.add(entity.id)
    }

    // update profile in hot cache if newer, otherwise return
    const cacheUpdated = hotProfilesCache.setIfNewer(entity.pointers[0], entity)
    if (!cacheUpdated) {
      return
    }

    const dbEntity: Sync.ProfileDbEntity = {
      ...entity,
      pointer: entity.pointers[0],
      localTimestamp: Date.now()
    }

    // if service is bootstrapping, queue the persistence for later
    // otherwise, persist directly
    if (bootstrapComplete) {
      db.upsertProfileIfNewer(dbEntity).catch((error) => {
        logger.error('Failed to persist profile to database', {
          entityId: entity.id,
          pointer: entity.pointers[0],
          error: error.message
        })
      })
    } else {
      dbPersistenceQueue
        .add(() => db.upsertProfileIfNewer(dbEntity))
        .catch((error) => {
          logger.error('Failed to queue profile persistence', {
            entityId: entity.id,
            pointer: entity.pointers[0],
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
    persistEntity,
    setBootstrapComplete,
    isBootstrapComplete,
    waitForDrain
  }
}
