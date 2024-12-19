import { AssetBundleConversionFinishedEvent } from '@dcl/schemas'
import {
  AppComponents,
  EventHandlerComponent,
  Manifest,
  ProcessorResult,
  Registry,
  ManifestStatusCode
} from '../../types'

export const createTexturesProcessor = ({
  logs,
  db,
  entityManifestFetcher
}: Pick<AppComponents, 'logs' | 'db' | 'entityManifestFetcher'>): EventHandlerComponent => {
  const logger = logs.getLogger('textures-processor')
  const SUCCESS_CODES: number[] = [
    ManifestStatusCode.SUCCESS,
    ManifestStatusCode.CONVERSION_ERRORS_TOLERATED,
    ManifestStatusCode.ALREADY_CONVERTED
  ]

  return {
    process: async (event: AssetBundleConversionFinishedEvent): Promise<ProcessorResult> => {
      const entity: Registry.DbEntity | null = await db.getRegistryById(event.metadata.entityId)

      if (!entity) {
        logger.error('Entity not found in the database', { entityId: event.metadata.entityId })
        return { ok: false, errors: ['Entity not found in the database'] }
      }

      const manifest: Manifest | null = await entityManifestFetcher.downloadManifest(
        event.metadata.entityId,
        event.metadata.platform
      )

      logger.debug('Metadata fetched', {
        entityId: event.metadata.entityId,
        platform: event.metadata.platform,
        manifest: JSON.stringify(manifest)
      })

      const status: Registry.Status =
        manifest && SUCCESS_CODES.includes(manifest.exitCode) ? Registry.Status.COMPLETE : Registry.Status.FAILED

      let registry: Registry.DbEntity | null = await db.upsertRegistryBundle(
        event.metadata.entityId,
        event.metadata.platform,
        event.metadata.isLods,
        status
      )

      if (!registry) {
        logger.error('Error storing bundle', { entityId: event.metadata.entityId, platform: event.metadata.platform })
        return { ok: false, errors: ['Error storing bundle'] }
      }

      logger.info(`Bundle stored`, { entityId: event.metadata.entityId, registry: JSON.stringify(registry) })

      if (
        registry.bundles.assets.mac === Registry.Status.COMPLETE &&
        registry.bundles.assets.windows === Registry.Status.COMPLETE
      ) {
        registry = (await db.updateRegistriesStatus([registry.id], Registry.Status.COMPLETE))[0]
      }

      const relatedEntities: Registry.PartialDbEntity[] = await db.getRelatedRegistries(registry)

      if (!relatedEntities.length) {
        logger.debug('No related entities found, skipping purge', {
          entityId: event.metadata.entityId,
          pointers: entity.metadata.pointers
        })

        return { ok: true }
      }

      const olderDeployments: Registry.PartialDbEntity[] | undefined = relatedEntities?.filter(
        (relatedEntity: Registry.PartialDbEntity) => relatedEntity.timestamp < registry.timestamp
      )

      if (olderDeployments?.length && registry.status === Registry.Status.COMPLETE) {
        logger.info('Marking older related registries as `obsolete`', {
          entityId: event.metadata.entityId,
          pointers: entity.metadata.pointers,
          entitiesToBeRemoved: JSON.stringify(
            olderDeployments.map((registry: Registry.PartialDbEntity) => ({
              id: registry.id,
              pointers: registry.pointers,
              timestamp: registry.timestamp
            }))
          )
        })

        await db.updateRegistriesStatus(
          olderDeployments.map((registry: Registry.PartialDbEntity) => registry.id),
          Registry.Status.OBSOLETE
        )
      }

      return { ok: true }
    },
    canProcess: (event: any): boolean => {
      AssetBundleConversionFinishedEvent.validate(event)

      return !AssetBundleConversionFinishedEvent.validate.errors?.length
    },
    name: 'Textures Processor'
  }
}
