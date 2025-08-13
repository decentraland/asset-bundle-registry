import { Entity } from '@dcl/schemas'
import { AppComponents, EventHandlerComponent, EventHandlerName, EventHandlerResult, Registry } from '../../types'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { Authenticator } from '@dcl/crypto'

export const createDeploymentEventHandler = ({
  registryOrchestrator,
  catalyst,
  worlds,
  db,
  logs
}: Pick<
  AppComponents,
  'registryOrchestrator' | 'catalyst' | 'worlds' | 'db' | 'logs'
>): EventHandlerComponent<DeploymentToSqs> => {
  const HANDLER_NAME = EventHandlerName.DEPLOYMENT
  const logger = logs.getLogger('deployment-handler')

  return {
    handle: async (event: DeploymentToSqs): Promise<EventHandlerResult> => {
      let entity: Entity | null
      try {
        const registryAlreadyExists = await db.getRegistryById(event.entity.entityId)

        if (registryAlreadyExists) {
          logger.warn('Registry already exists, will not process deployment', { event: JSON.stringify(event) })
          return {
            ok: true,
            handlerName: HANDLER_NAME
          }
        }

        if (worlds.isWorldDeployment(event)) {
          const [worldContentServerUrl] = event.contentServerUrls!
          entity = await worlds.getWorld(event.entity.entityId, worldContentServerUrl)
        } else {
          entity = await catalyst.getEntityById(event.entity.entityId, {
            overrideContentServerUrl: event.contentServerUrls?.length ? event.contentServerUrls[0] : undefined
          })
        }

        if (!entity) {
          logger.error('Entity not found', { event: JSON.stringify(event) })
          return {
            ok: false,
            errors: [`Entity with id ${event.entity.entityId} was not found`],
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

        const deployer = Authenticator.ownerAddress(event.entity.authChain)
        await registryOrchestrator.persistAndRotateStates({
          ...entity,
          deployer,
          bundles: defaultBundles,
          versions: defaultVersions
        })

        return { ok: true, handlerName: HANDLER_NAME }
      } catch (error: any) {
        logger.error('Failed to process', {
          error: error?.message || 'Unexpected processor failure',
          stack: JSON.stringify(error?.stack)
        })

        return { ok: false, errors: [error?.message || 'Unexpected processor failure'], handlerName: HANDLER_NAME }
      }
    },
    canHandle: (event: any): boolean => {
      DeploymentToSqs.validate(event)

      return !DeploymentToSqs.validate.errors?.length
    },
    name: HANDLER_NAME
  }
}
