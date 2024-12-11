import { AssetBundleConvertedEvent } from '@dcl/schemas'
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

  return {
    process: async (event: AssetBundleConvertedEvent): Promise<ProcessorResult> => {
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

      const status: Registry.StatusValues =
        manifest && (manifest.exitCode as ManifestStatusCode) === ManifestStatusCode.SUCCESS
          ? Registry.StatusValues.OPTMIZED
          : Registry.StatusValues.ERROR

      const registry: Registry.DbEntity | null = await db.upsertRegistryBundle(
        event.metadata.entityId,
        event.metadata.platform,
        status
      )

      if (!registry) {
        logger.error('Error storing bundle', { entityId: event.metadata.entityId, platform: event.metadata.platform })
        return { ok: false, errors: ['Error storing bundle'] }
      }

      logger.info(`Bundle stored`, { entityId: event.metadata.entityId, platform: event.metadata.platform, status })

      setImmediate(async () => {
        const relatedEntities: Registry.PartialDbEntity[] | null = await db.getRelatedRegistries(registry)

        if (!relatedEntities) {
          logger.debug('No related entities found, skipping purge', {
            entityId: event.metadata.entityId,
            pointers: entity.metadata.pointers
          })
        }

        const olderDeployments: Registry.PartialDbEntity[] | undefined = relatedEntities?.filter(
          (registry: Registry.PartialDbEntity) => registry.timestamp < entity.timestamp
        )

        if (olderDeployments?.length && registry.status === Registry.StatusValues.OPTMIZED) {
          logger.info('Purging older related registries', {
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

          await db.deleteRegistries(olderDeployments.map((registry: Registry.PartialDbEntity) => registry.id))
        }
      })

      return { ok: true }
    },
    canProcess: (event: any): boolean => {
      AssetBundleConvertedEvent.validate(event)

      return !AssetBundleConvertedEvent.validate.errors?.length
    },
    name: 'Textures Processor'
  }
}
