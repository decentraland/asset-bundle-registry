import PQueue from 'p-queue'
import { AppComponents, IEntityPersisterComponent } from '../../types'
import { Sync } from '../../types'
import { Entity } from '@dcl/schemas'

const DB_PERSISTENCE_CONCURRENCY = 30

/**
 * Component in charge of persisting entities to the different data stores (caches and database).
 * Handles persistence of entities in the hot cache, entity tracker and database.
 *
 * @export
 * @param {(Pick<
 *     AppComponents,
 *     'logs' | 'db' | 'profilesCache' | 'entityTracker' | 'memoryStorage'
 *   >)} components
 * @return {*}  {IEntityPersistentComponent}
 */
export function createEntityPersisterComponent({
  logs,
  db,
  profilesCache,
  entityDeploymentTracker
}: Pick<AppComponents, 'logs' | 'db' | 'profilesCache' | 'entityDeploymentTracker'>): IEntityPersisterComponent {
  const logger = logs.getLogger('entity-persistent')

  let bootstrapComplete = false

  const dbPersistenceQueue = new PQueue({ concurrency: DB_PERSISTENCE_CONCURRENCY })

  async function persistEntity(entity: Entity): Promise<void> {
    // prevent race-condition duplicates (short-term dedup cache only)
    if (entityDeploymentTracker.tryMarkDuplicate(entity.id)) {
      return
    }

    // update profile in hot cache if newer, otherwise return
    const cacheUpdated = profilesCache.setIfNewer(entity.pointers[0], entity)
    if (!cacheUpdated) {
      return
    }

    // mark as processed in bloom filter (permanent tracking)
    entityDeploymentTracker.markAsProcessed(entity.id)

    const dbEntity: Sync.ProfileDbEntity = {
      ...entity,
      pointer: entity.pointers[0],
      localTimestamp: Date.now()
    }

    // if service is bootstrapping, queue the persistence for later
    // otherwise, persist directly
    if (bootstrapComplete) {
      await db.upsertProfileIfNewer(dbEntity).catch((error) => {
        logger.error('Failed to persist profile to database', {
          entityId: entity.id,
          pointer: entity.pointers[0],
          error: error.message
        })
      })
    } else {
      await dbPersistenceQueue
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
