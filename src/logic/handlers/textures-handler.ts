import { AssetBundleConversionFinishedEvent, Entity } from '@dcl/schemas'
import { AppComponents, EventHandlerComponent, EventHandlerName, EventHandlerResult, Registry } from '../../types'
import { ManifestStatusCode } from '../entity-status-fetcher'

export const createTexturesEventHandler = ({
  logs,
  db,
  catalyst,
  worlds,
  registryOrchestrator,
  queuesStatusManager
}: Pick<
  AppComponents,
  'logs' | 'db' | 'catalyst' | 'worlds' | 'registryOrchestrator' | 'queuesStatusManager'
>): EventHandlerComponent<AssetBundleConversionFinishedEvent> => {
  const HANDLER_NAME = EventHandlerName.TEXTURES
  const logger = logs.getLogger('textures-handler')

  return {
    handle: async (event: AssetBundleConversionFinishedEvent): Promise<EventHandlerResult> => {
      try {
        let entity: Registry.DbEntity | null = await db.getRegistryById(event.metadata.entityId)

        if (!entity) {
          logger.info('Entity not found in the database, will create it', { entityId: event.metadata.entityId })
          let fetchedEntity: Entity | null

          if (event.metadata.isWorld) {
            fetchedEntity = await worlds.getWorld(event.metadata.entityId)
          } else {
            fetchedEntity = await catalyst.getEntityById(event.metadata.entityId)
          }

          if (!fetchedEntity) {
            logger.error('Entity not found', { event: JSON.stringify(event) })
            return {
              ok: false,
              errors: [`Entity with id ${event.metadata.entityId} was not found`],
              handlerName: HANDLER_NAME
            }
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

          const defaultVersions: Registry.Versions = {
            assets: {
              windows: { version: '', buildDate: '' },
              mac: { version: '', buildDate: '' },
              webgl: { version: '', buildDate: '' }
            }
          }

          entity = await registryOrchestrator.persistAndRotateStates({
            ...fetchedEntity,
            deployer: '', // cannot infer from textures event
            bundles: defaultBundles,
            versions: defaultVersions
          })
        }

        if (!event.metadata.isLods) {
          await queuesStatusManager.markAsFinished(event.metadata.platform, event.metadata.entityId)
        }

        const status: Registry.SimplifiedStatus =
          event.metadata.statusCode === ManifestStatusCode.SUCCESS ||
          event.metadata.statusCode === ManifestStatusCode.CONVERSION_ERRORS_TOLERATED ||
          event.metadata.statusCode === ManifestStatusCode.ALREADY_CONVERTED
            ? Registry.SimplifiedStatus.COMPLETE
            : Registry.SimplifiedStatus.FAILED

        let registry: Registry.DbEntity | null = await db.upsertRegistryBundle(
          event.metadata.entityId,
          event.metadata.platform,
          !!event.metadata.isLods,
          status
        )

        if (!registry) {
          logger.error('Error storing bundle', { entityId: event.metadata.entityId, platform: event.metadata.platform })
          return { ok: false, errors: ['Error storing bundle'], handlerName: HANDLER_NAME }
        }

        // Update version separately
        registry = await db.updateRegistryVersionWithBuildDate(
          event.metadata.entityId,
          event.metadata.platform,
          event.metadata.version,
          event.metadata.buildDate
        )

        if (!registry) {
          logger.error('Error updating version', {
            entityId: event.metadata.entityId,
            platform: event.metadata.platform
          })
          return { ok: false, errors: ['Error storing version'], handlerName: HANDLER_NAME }
        }

        logger.info(`Bundle stored`, { entityId: event.metadata.entityId, bundles: JSON.stringify(registry.bundles) })

        await registryOrchestrator.persistAndRotateStates(registry)

        return { ok: true, handlerName: HANDLER_NAME }
      } catch (errors: any) {
        logger.error('Failed to process', {
          error: errors?.message || 'Unexpected processor failure',
          stack: JSON.stringify(errors?.stack)
        })

        return { ok: false, errors: [errors?.message || 'Unexpected processor failure'], handlerName: HANDLER_NAME }
      }
    },
    canHandle: (event: any): boolean => {
      AssetBundleConversionFinishedEvent.validate(event)

      return !AssetBundleConversionFinishedEvent.validate.errors?.length
    },
    name: HANDLER_NAME
  }
}
