import { AssetBundleConversionFinishedEvent } from '@dcl/schemas'
import { AppComponents, EventHandlerComponent, ProcessorResult, Registry } from '../../types'

export const createTexturesProcessor = ({
  logs,
  db,
  catalyst,
  entityStatusFetcher,
  registryOrchestrator
}: Pick<
  AppComponents,
  'logs' | 'db' | 'catalyst' | 'entityStatusFetcher' | 'registryOrchestrator'
>): EventHandlerComponent => {
  const logger = logs.getLogger('textures-processor')

  return {
    process: async (event: AssetBundleConversionFinishedEvent): Promise<ProcessorResult> => {
      let entity: Registry.DbEntity | null = await db.getRegistryById(event.metadata.entityId)

      if (!entity) {
        logger.info('Entity not found in the database, will create it', { entityId: event.metadata.entityId })
        const fetchedEntity = await catalyst.getEntityById(event.metadata.entityId)

        if (!fetchedEntity) {
          logger.error('Entity not found', { event: JSON.stringify(event) })
          return { ok: false, errors: [`Entity with id ${event.metadata.entityId} was not found`] }
        }

        const defaultBundles: Registry.Bundles = {
          assets: {
            windows: Registry.SimplifiedStatus.PENDING,
            mac: Registry.SimplifiedStatus.PENDING,
            webgl: Registry.SimplifiedStatus.PENDING
          },
          lods: {
            windows: Registry.SimplifiedStatus.PENDING,
            mac: Registry.SimplifiedStatus.PENDING,
            webgl: Registry.SimplifiedStatus.PENDING
          }
        }

        entity = await registryOrchestrator.persistAndRotateStates({
          ...fetchedEntity,
          deployer: '', // cannot infer from textures event
          bundles: defaultBundles
        })
      }

      const status: Registry.SimplifiedStatus = await entityStatusFetcher.fetchBundleStatus(
        event.metadata.entityId,
        event.metadata.platform
      )

      const registry: Registry.DbEntity | null = await db.upsertRegistryBundle(
        event.metadata.entityId,
        event.metadata.platform,
        !!event.metadata.isLods,
        status
      )

      if (!registry) {
        logger.error('Error storing bundle', { entityId: event.metadata.entityId, platform: event.metadata.platform })
        return { ok: false, errors: ['Error storing bundle'] }
      }

      logger.info(`Bundle stored`, { entityId: event.metadata.entityId, bundles: JSON.stringify(registry.bundles) })

      await registryOrchestrator.persistAndRotateStates(registry)

      return { ok: true }
    },
    canProcess: (event: any): boolean => {
      AssetBundleConversionFinishedEvent.validate(event)

      return !AssetBundleConversionFinishedEvent.validate.errors?.length
    },
    name: 'Textures Processor'
  }
}
