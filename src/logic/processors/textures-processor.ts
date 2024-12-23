import { AssetBundleConversionFinishedEvent } from '@dcl/schemas'
import { AppComponents, EventHandlerComponent, ProcessorResult, Registry } from '../../types'

export const createTexturesProcessor = ({
  logs,
  db,
  entityStatusFetcher,
  registryOrchestrator
}: Pick<AppComponents, 'logs' | 'db' | 'entityStatusFetcher' | 'registryOrchestrator'>): EventHandlerComponent => {
  const logger = logs.getLogger('textures-processor')

  return {
    process: async (event: AssetBundleConversionFinishedEvent): Promise<ProcessorResult> => {
      const entity: Registry.DbEntity | null = await db.getRegistryById(event.metadata.entityId)

      if (!entity) {
        logger.error('Entity not found in the database', { entityId: event.metadata.entityId })
        return { ok: false, errors: ['Entity not found in the database'] }
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
