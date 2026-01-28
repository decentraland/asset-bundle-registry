import {
  AppComponents,
  Registry,
  UndeploymentResult,
  SpawnRecalculationParams,
  SpawnRecalculationResult
} from '../../types'
import { RelatedEntities } from './types'

export interface IRegistryComponent {
  /**
   * Persists a registry and rotates the states of related registries.
   * Determines the appropriate status based on related entities.
   */
  persistAndRotateStates(registry: Omit<Registry.DbEntity, 'status'>): Promise<Registry.DbEntity>

  /**
   * Atomically undeploys world scenes and recalculates spawn coordinates.
   * All operations are performed within a database transaction.
   */
  undeployWorldScenes(entityIds: string[]): Promise<UndeploymentResult>
}

export function createRegistryComponent({
  db,
  logs,
  metrics,
  coordinates
}: Pick<AppComponents, 'db' | 'logs' | 'metrics' | 'coordinates'>): IRegistryComponent {
  const logger = logs.getLogger('registry')

  function categorizeRelatedEntities(
    relatedEntities: Registry.PartialDbEntity[],
    registry: Omit<Registry.DbEntity, 'status'>
  ): RelatedEntities {
    return relatedEntities.reduce(
      (acc: RelatedEntities, relatedEntity: Registry.PartialDbEntity) => {
        if (relatedEntity.id.toLocaleLowerCase() === registry.id.toLocaleLowerCase()) {
          return acc
        }

        if (
          relatedEntity.timestamp < registry.timestamp &&
          (!acc.fallback || relatedEntity.timestamp > acc.fallback.timestamp) &&
          (relatedEntity.status === Registry.Status.COMPLETE || relatedEntity.status === Registry.Status.FALLBACK)
        ) {
          acc.fallback = relatedEntity
        } else if (relatedEntity.timestamp > registry.timestamp) {
          acc.newerEntities.push(relatedEntity)
        } else {
          acc.olderEntities.push(relatedEntity)
        }

        return acc
      },
      {
        newerEntities: [],
        olderEntities: [],
        fallback: null
      }
    )
  }

  function determineRegistryStatus(
    registry: Omit<Registry.DbEntity, 'status'>,
    splitRelatedEntities: RelatedEntities
  ): Registry.Status {
    const hasNewerCompleteOrFallback = splitRelatedEntities.newerEntities.some((entity) =>
      [Registry.Status.COMPLETE, Registry.Status.FALLBACK].includes(entity.status)
    )

    if (hasNewerCompleteOrFallback) {
      return Registry.Status.OBSOLETE
    }

    const hasAssetsFailed =
      registry.bundles.assets.mac === Registry.SimplifiedStatus.FAILED ||
      registry.bundles.assets.windows === Registry.SimplifiedStatus.FAILED

    if (hasAssetsFailed) {
      return Registry.Status.FAILED
    }

    const areAssetsComplete =
      registry.bundles.assets.mac === Registry.SimplifiedStatus.COMPLETE &&
      registry.bundles.assets.windows === Registry.SimplifiedStatus.COMPLETE

    if (areAssetsComplete) {
      const hasNewerPending = splitRelatedEntities.newerEntities.some(
        (entity) => entity.status === Registry.Status.PENDING
      )
      return hasNewerPending ? Registry.Status.FALLBACK : Registry.Status.COMPLETE
    }

    return Registry.Status.PENDING
  }

  async function persistAndRotateStates(registry: Omit<Registry.DbEntity, 'status'>): Promise<Registry.DbEntity> {
    const relatedRegistries: Registry.PartialDbEntity[] = await db.getRelatedRegistries(registry)
    const splitRelatedEntities: RelatedEntities = categorizeRelatedEntities(relatedRegistries, registry)
    const registryStatus: Registry.Status = determineRegistryStatus(registry, splitRelatedEntities)

    logger.info('Persisting entity', {
      entityId: registry.id,
      status: registryStatus,
      newerEntities: splitRelatedEntities.newerEntities?.map((relatedEntity) => relatedEntity.id).join(', ') || '',
      olderEntities: splitRelatedEntities.olderEntities?.map((relatedEntity) => relatedEntity.id).join(', ') || '',
      fallback: splitRelatedEntities.fallback?.id || ''
    })

    const insertedRegistry = await db.insertRegistry({
      ...registry,
      status: registryStatus
    })

    if (splitRelatedEntities.olderEntities.length) {
      const olderEntitiesIds = splitRelatedEntities.olderEntities.map((entity: Registry.PartialDbEntity) => entity.id)
      logger.debug('Marking older entities as outdated', {
        newEntityId: registry.id,
        olderEntitiesIds: olderEntitiesIds.join(', ')
      })

      await db.updateRegistriesStatus(olderEntitiesIds, Registry.Status.OBSOLETE)
    }

    if (splitRelatedEntities.fallback) {
      logger.debug('Marking entity as fallback', {
        entityId: registry.id,
        fallbackId: splitRelatedEntities.fallback.id
      })

      await db.updateRegistriesStatus(
        [splitRelatedEntities.fallback.id],
        registryStatus === Registry.Status.OBSOLETE || registryStatus === Registry.Status.COMPLETE
          ? Registry.Status.OBSOLETE
          : Registry.Status.FALLBACK
      )
    }

    registryStatus === Registry.Status.COMPLETE && metrics.increment('registries_ready_count', {}, 1)

    return insertedRegistry
  }

  /**
   * Pure function to calculate spawn coordinate action.
   * Contains the business logic, no DB calls.
   */
  function calculateSpawnAction(params: SpawnRecalculationParams): SpawnRecalculationResult {
    const { parcels, currentSpawn } = params

    // If world is empty, delete spawn coordinate
    if (parcels.length === 0) {
      return { action: 'delete' }
    }

    // If no spawn exists, calculate center
    if (!currentSpawn) {
      const center = coordinates.calculateCenter(parcels)
      return { action: 'upsert', x: center.x, y: center.y, isUserSet: false }
    }

    // If spawn is not user-set, recalculate center
    if (!currentSpawn.isUserSet) {
      const center = coordinates.calculateCenter(parcels)
      return { action: 'upsert', x: center.x, y: center.y, isUserSet: false }
    }

    // If user-set spawn is still valid, keep it
    const currentCoord = { x: currentSpawn.x, y: currentSpawn.y }
    if (coordinates.isCoordinateInParcels(currentCoord, parcels)) {
      return { action: 'none' }
    }

    // User-set spawn is no longer valid, recalculate center
    const center = coordinates.calculateCenter(parcels)
    return { action: 'upsert', x: center.x, y: center.y, isUserSet: false }
  }

  async function undeployWorldScenes(entityIds: string[]): Promise<UndeploymentResult> {
    logger.info('Undeploying world scenes', { entityIds: entityIds.join(', ') })

    const result = await db.undeployWorldScenes(entityIds, calculateSpawnAction)

    logger.info('World scenes undeployed', {
      undeployedCount: result.undeployedCount,
      affectedWorlds: result.affectedWorlds.join(', '),
      spawnCoordinatesUpdated: result.spawnCoordinatesUpdated.join(', ')
    })

    return result
  }

  return {
    persistAndRotateStates,
    undeployWorldScenes
  }
}
