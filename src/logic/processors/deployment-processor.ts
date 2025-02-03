import { Entity } from '@dcl/schemas'
import { AppComponents, EventHandlerComponent, ProcessorResult, Registry } from '../../types'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { Authenticator } from '@dcl/crypto'

export const createDeploymentProcessor = ({
  registryOrchestrator,
  catalyst,
  worlds,
  logs
}: Pick<AppComponents, 'registryOrchestrator' | 'catalyst' | 'worlds' | 'logs'>): EventHandlerComponent => {
  const logger = logs.getLogger('deployment-processor')

  return {
    process: async (event: DeploymentToSqs): Promise<ProcessorResult> => {
      let entity: Entity | null
      try {
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
          return { ok: false, errors: [`Entity with id ${event.entity.entityId} was not found`] }
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

        const deployer = Authenticator.ownerAddress(event.entity.authChain)
        await registryOrchestrator.persistAndRotateStates({
          ...entity,
          deployer,
          bundles: defaultBundles
        })

        return { ok: true }
      } catch (error: any) {
        logger.error('Failed to process', {
          error: error?.message || 'Unexpected processor failure',
          stack: JSON.stringify(error?.stack)
        })

        return { ok: false, errors: [error?.message || 'Unexpected processor failure'] }
      }
    },
    canProcess: (event: any): boolean => {
      DeploymentToSqs.validate(event)

      return !DeploymentToSqs.validate.errors?.length
    },
    name: 'Deployment Processor'
  }
}
