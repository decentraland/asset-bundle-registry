import { Entity } from '@dcl/schemas'
import { AppComponents, EventHandlerComponent, ProcessorResult, Registry } from '../../types'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { Authenticator } from '@dcl/crypto'

export const createDeploymentProcessor = ({
  db,
  catalyst,
  logs
}: Pick<AppComponents, 'db' | 'catalyst' | 'logs'>): EventHandlerComponent => {
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

      const deployer = Authenticator.ownerAddress(event.entity.authChain)

      await db.insertRegistry({ ...entity, deployer, status: Registry.StatusValues.PENDING })

      logger.debug('Deployment saved', { entityId: entity.id })

      return { ok: true }
    },
    canProcess: (event: any): boolean => {
      DeploymentToSqs.validate(event)
      DeploymentToSqs.validate.errors?.forEach((error) => {
        logger.error('Could not process', { reason: JSON.stringify(error) })
      })

      return !DeploymentToSqs.validate.errors?.length
    },
    name: 'Deployment Processor'
  }
}
