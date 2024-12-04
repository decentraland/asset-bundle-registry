import { Entity } from '@dcl/schemas'
import { AppComponents, ProcessorResult, Registry } from '../../types'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'

export const createDeploymentProcessor = ({ db, catalyst, logs }: Pick<AppComponents, 'db' | 'catalyst' | 'logs'>) => {
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

      await db.insertRegistry({ ...entity, status: Registry.StatusValues.PENDING })

      logger.debug('Deployment saved', { entityId: entity.id })

      return { ok: true }
    }
  }
}
