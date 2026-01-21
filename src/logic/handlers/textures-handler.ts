import { AssetBundleConversionFinishedEvent, Entity } from '@dcl/schemas'
import { AppComponents, IEventHandlerComponent, EventHandlerName, EventHandlerResult, Registry } from '../../types'
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
>): IEventHandlerComponent<AssetBundleConversionFinishedEvent> => {
  const HANDLER_NAME = EventHandlerName.TEXTURES
  const logger = logs.getLogger('textures-handler')

  return {
    handle: async (event: AssetBundleConversionFinishedEvent): Promise<EventHandlerResult> => {
      try {
        const metadata = event.metadata
        let entity: Registry.DbEntity | null = await db.getRegistryById(metadata.entityId)

        // Skip processing if the entity has been undeployed (marked as OBSOLETE)
        if (entity?.status === Registry.Status.OBSOLETE) {
          logger.info('Entity is OBSOLETE, skipping bundle update', { entityId: metadata.entityId })
          return { ok: true, handlerName: HANDLER_NAME }
        }

        if (!entity) {
          logger.info('Entity not found in the database, will create it', { entityId: metadata.entityId })
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
              errors: [`Entity with id ${metadata.entityId} was not found`],
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

        if (!metadata.isLods) {
          await queuesStatusManager.markAsFinished(metadata.platform, metadata.entityId)
        }

        const status: Registry.SimplifiedStatus =
          metadata.statusCode === ManifestStatusCode.SUCCESS ||
          metadata.statusCode === ManifestStatusCode.CONVERSION_ERRORS_TOLERATED ||
          metadata.statusCode === ManifestStatusCode.ALREADY_CONVERTED
            ? Registry.SimplifiedStatus.COMPLETE
            : Registry.SimplifiedStatus.FAILED

        let registry: Registry.DbEntity | null = await db.upsertRegistryBundle(
          metadata.entityId,
          metadata.platform,
          !!metadata.isLods,
          status
        )

        if (!registry) {
          logger.error('Error storing bundle', { entityId: metadata.entityId, platform: metadata.platform })
          return { ok: false, errors: ['Error storing bundle'], handlerName: HANDLER_NAME }
        }

        // Update version separately
        registry = await db.updateRegistryVersionWithBuildDate(
          metadata.entityId,
          metadata.platform,
          metadata.version,
          new Date(event.timestamp).toISOString()
        )

        if (!registry) {
          logger.error('Error updating version', {
            entityId: metadata.entityId,
            platform: metadata.platform
          })
          return { ok: false, errors: ['Error storing version'], handlerName: HANDLER_NAME }
        }

        logger.info(`Bundle stored`, { entityId: metadata.entityId, bundles: JSON.stringify(registry.bundles) })

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
