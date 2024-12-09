import { AssetBundleConvertedEvent } from '@dcl/schemas'
import { AppComponents, EventHandlerComponent, ProcessorResult, Registry } from '../../types'

export const createTexturesProcessor = ({ logs, db }: Pick<AppComponents, 'logs' | 'db'>): EventHandlerComponent => {
  const logger = logs.getLogger('textures-processor')

  return {
    process: async (event: AssetBundleConvertedEvent): Promise<ProcessorResult> => {
      const entity: Registry.DbEntity | null = await db.getRegistryById(event.metadata.entityId)

      if (!entity) {
        logger.error('Entity not found in the database', { entityId: event.metadata.entityId })
        return { ok: false, errors: ['Entity not found in the database'] }
      }

      await db.upsertRegistryBundle(event.metadata.entityId, event.metadata.platform, Registry.StatusValues.OPTMIZED)
      logger.info("Entity marked as 'optimized'", { entityId: event.metadata.entityId })

      return { ok: true }
    },
    canProcess: (event: any): boolean => {
      AssetBundleConvertedEvent.validate(event)

      return !AssetBundleConvertedEvent.validate.errors?.length
    },
    name: 'Textures Processor'
  }
}
