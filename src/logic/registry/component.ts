import { AppComponents, Registry, SupportedPlatform, UndeploymentResult } from '../../types'
import { RelatedEntities } from './types'

export interface IRegistryComponent {
  /**
   * Persists a registry and rotates the states of related registries.
   * Determines the appropriate status based on related entities.
   */
  persistAndRotateStates(registry: Omit<Registry.DbEntity, 'status'>): Promise<Registry.DbEntity>

  /**
   * Atomically updates a bundle, determines status from the current DB state, and rotates related registries.
   * All operations happen within a single database transaction to prevent race conditions from
   * concurrent texture events overwriting correct statuses with stale data.
   *
   * @param params.bundleUpdate - The bundle status update to apply
   * @param params.versionUpdate - Optional version info update
   * @returns The updated registry entity, or null if the entity was not found
   */
  updateBundleAndRotateStates(params: {
    bundleUpdate: { entityId: string; platform: SupportedPlatform; isLods: boolean; status: Registry.SimplifiedStatus }
    versionUpdate?: { entityId: string; platform: SupportedPlatform; version: string; buildDate: string }
  }): Promise<Registry.DbEntity | null>

  /**
   * Undeploys world scenes and recalculates spawn coordinates.
   * Operations are performed in separate transactions with timestamp-based conflict resolution.
   *
   * @param entityIds - Array of entity IDs to undeploy
   * @param worldName - The world name from the undeployment event
   * @param eventTimestamp - The timestamp of the event that triggered this undeployment
   */
  undeployWorldScenes(entityIds: string[], worldName: string, eventTimestamp: number): Promise<UndeploymentResult>

  /**
   * Undeploys all registries belonging to a world and recalculates spawn coordinates.
   *
   * @param worldName - The world name to undeploy all registries for
   * @param eventTimestamp - The timestamp of the event that triggered this undeployment
   */
  undeployWorld(worldName: string, eventTimestamp: number): Promise<UndeploymentResult>
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
      return Registry.Status.COMPLETE
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

  async function undeployWorldScenes(
    entityIds: string[],
    worldName: string,
    eventTimestamp: number
  ): Promise<UndeploymentResult> {
    const normalizedWorldName = worldName.toLowerCase()

    logger.info('Undeploying world scenes', {
      entityIds: entityIds.join(', '),
      worldName: normalizedWorldName,
      eventTimestamp
    })

    const result = await db.undeployWorldScenes(entityIds, normalizedWorldName, eventTimestamp)

    logger.info('Registries marked as obsolete', {
      undeployedCount: result.undeployedCount,
      worldName: result.worldName || 'none',
      eventTimestamp
    })

    if (result.worldName && result.undeployedCount > 0) {
      await coordinates.recalculateSpawnIfNeeded(result.worldName, eventTimestamp)
    }

    return result
  }

  async function undeployWorld(worldName: string, eventTimestamp: number): Promise<UndeploymentResult> {
    logger.info('Undeploying entire world', { worldName, eventTimestamp })

    // 1. Undeploy all registries belonging to the world (only those created before eventTimestamp)
    const result = await db.undeployWorldByName(worldName, eventTimestamp)

    logger.info('World registries marked as obsolete', {
      undeployedCount: result.undeployedCount,
      worldName: result.worldName || 'none',
      eventTimestamp
    })

    // 2. Recalculate spawn coordinate for the world (only if registries were actually undeployed)
    if (result.worldName && result.undeployedCount > 0) {
      await coordinates.recalculateSpawnIfNeeded(result.worldName, eventTimestamp)
    }

    return result
  }

  /**
   * Atomically updates a bundle, determines the registry status from the current DB state,
   * and rotates related registries — all within a single database transaction.
   *
   * This method prevents race conditions from concurrent texture events. Without atomicity,
   * two concurrent SQS consumers processing different platform conversions for the same entity
   * could interleave their reads and writes, causing a stale thread to overwrite a correct
   * COMPLETE status back to PENDING. By reading the entity's current bundle state inside the
   * transaction (after the bundle update), the status determination always reflects the latest data.
   *
   * @param params.bundleUpdate - The bundle status update to apply (entityId, platform, isLods, status)
   * @param params.versionUpdate - Optional version and build date update (omitted when preserving previous status)
   * @returns The updated registry entity with its final status, or null if the entity was not found
   */
  async function updateBundleAndRotateStates(params: {
    bundleUpdate: { entityId: string; platform: SupportedPlatform; isLods: boolean; status: Registry.SimplifiedStatus }
    versionUpdate?: { entityId: string; platform: SupportedPlatform; version: string; buildDate: string }
  }): Promise<Registry.DbEntity | null> {
    const result = await db.persistRegistryInTransaction({
      ...params,
      determineStatusAndRotate: (currentEntity, relatedRegistries) => {
        const splitRelatedEntities = categorizeRelatedEntities(relatedRegistries, currentEntity)
        const status = determineRegistryStatus(currentEntity, splitRelatedEntities)

        logger.info('Persisting entity (atomic)', {
          entityId: currentEntity.id,
          status,
          newerEntities: splitRelatedEntities.newerEntities?.map((e) => e.id).join(', ') || '',
          olderEntities: splitRelatedEntities.olderEntities?.map((e) => e.id).join(', ') || '',
          fallback: splitRelatedEntities.fallback?.id || ''
        })

        // Only rotate older entities and fallback when the current entity completes or is obsolete.
        // When FAILED or PENDING, leave other entities untouched so fallbacks are preserved.
        const shouldRotate = status === Registry.Status.COMPLETE || status === Registry.Status.OBSOLETE

        const olderEntityIds = shouldRotate ? splitRelatedEntities.olderEntities.map((e) => e.id) : []

        let fallbackUpdate: { id: string; status: Registry.Status } | null = null
        if (splitRelatedEntities.fallback && shouldRotate) {
          fallbackUpdate = {
            id: splitRelatedEntities.fallback.id,
            status: Registry.Status.OBSOLETE
          }
        }

        status === Registry.Status.COMPLETE && metrics.increment('registries_ready_count', {}, 1)

        return { status, olderEntityIds, fallbackUpdate }
      }
    })

    return result
  }

  return {
    persistAndRotateStates,
    updateBundleAndRotateStates,
    undeployWorldScenes,
    undeployWorld
  }
}
