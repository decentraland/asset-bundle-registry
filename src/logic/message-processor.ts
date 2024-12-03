import { Entity } from '@dcl/schemas'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { AppComponents, MessageProcessorComponent, Registry } from '../types'

export async function createMessageProcessorComponent({
  catalyst,
  db,
  logs
}: Pick<AppComponents, 'catalyst' | 'db' | 'logs' | 'config' | 'metrics'>): Promise<MessageProcessorComponent> {
  const log = logs.getLogger('message-processor')

  async function process(message: any) {
    log.debug('Processing', { message })

    if (DeploymentToSqs.validate(message)) {
      const entity: Entity = await catalyst.getEntityById(
        message.entity.entityId,
        message.contentServerUrls?.length ? message.contentServerUrls[0] : undefined
      )

      if (!entity) {
        log.error('Entity not found', { message: JSON.stringify(message) })
        return
      }

      await db.insertRegistry({ ...entity, status: Registry.StatusValues.PENDING })

      log.debug('Deployment saved', { entityId: entity.id })
    } else {
      log.error('Invalid message received', { message: JSON.stringify(message) })
    }
  }

  return { process }
}
