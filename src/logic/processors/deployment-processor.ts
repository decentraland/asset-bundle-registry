import { Entity } from '@dcl/schemas'
import { AppComponents, EventHandlerComponent, ProcessorResult, Registry } from '../../types'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { Authenticator } from '@dcl/crypto'

export const createDeploymentProcessor = ({
  registryOrchestrator,
  catalyst,
  logs
}: Pick<AppComponents, 'registryOrchestrator' | 'catalyst' | 'logs'>): EventHandlerComponent => {
  const logger = logs.getLogger('deployment-processor')

  return {
    process: async (event: DeploymentToSqs): Promise<ProcessorResult> => {
      const entity: Entity = await catalyst.getEntityById(
        event.entity.entityId,
        event.contentServerUrls?.length ? event.contentServerUrls[0] : undefined
      )

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
    },
    canProcess: (event: any): boolean => {
      DeploymentToSqs.validate(event)

      return !DeploymentToSqs.validate.errors?.length
    },
    name: 'Deployment Processor'
  }
}
