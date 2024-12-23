import { AppComponents, Registry, RegistryOrchestratorComponent } from '../types'

export function createRegistryOrchestratorComponent({
  db,
  logs
}: Pick<AppComponents, 'db' | 'logs'>): RegistryOrchestratorComponent {
  const logger = logs.getLogger('registry-orchestrator')

  function categorizeRelatedEntities(
    relatedEntities: Registry.PartialDbEntity[],
    by: number
  ): {
    newerEntities: Registry.PartialDbEntity[]
    olderEntities: Registry.PartialDbEntity[]
    fallback: Registry.PartialDbEntity | null
  } {
    return relatedEntities.reduce(
      (acc: any, relatedEntity: Registry.PartialDbEntity) => {
        if (
          relatedEntity.timestamp < by &&
          (!acc.fallback || relatedEntity.timestamp > acc.fallback.timestamp) &&
          (relatedEntity.status === Registry.Status.COMPLETE || relatedEntity.status === Registry.Status.FALLBACK)
        ) {
          acc.fallback = relatedEntity
        } else if (relatedEntity.timestamp > by) {
          acc.newerEntities.push(relatedEntity)
        } else {
          acc.olderEntities.push(relatedEntity)
        }

        return acc
      },
      {
        newerEntities: [] as Registry.PartialDbEntity[],
        olderEntities: [] as Registry.PartialDbEntity[],
        fallback: null as Registry.PartialDbEntity | null
      }
    )
  }

  function determineRegistryStatus(
    registry: Omit<Registry.DbEntity, 'status'>,
    splitRelatedEntities: {
      newerEntities: Registry.PartialDbEntity[]
      olderEntities: Registry.PartialDbEntity[]
      fallback: Registry.PartialDbEntity | null
    }
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

  async function persistAndRotateStates(registry: Omit<Registry.DbEntity, 'status'>): Promise<void> {
    const relatedRegistries: Registry.PartialDbEntity[] = await db.getRelatedRegistries(registry)
    const splitRelatedEntities: {
      newerEntities: Registry.PartialDbEntity[]
      olderEntities: Registry.PartialDbEntity[]
      fallback: Registry.PartialDbEntity | null
    } = categorizeRelatedEntities(relatedRegistries, registry.timestamp)
    const registryStatus: Registry.Status = determineRegistryStatus(registry, splitRelatedEntities)

    logger.info('Persisting entity', {
      entityId: registry.id,
      status: registryStatus,
      newerEntities: splitRelatedEntities.newerEntities?.join(', ') || '',
      olderEntities: splitRelatedEntities.olderEntities?.join(', ') || '',
      fallback: splitRelatedEntities.fallback?.id || ''
    })

    await db.insertRegistry({
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
  }

  return { persistAndRotateStates }
}
