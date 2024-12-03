import { Entity } from '@dcl/schemas'
import { AppComponents, MessageProcessorComponent } from '../types'

export async function createMessageProcessorComponent({
  catalyst,
  logs
}: Pick<AppComponents, 'catalyst' | 'logs' | 'config' | 'metrics'>): Promise<MessageProcessorComponent> {
  const log = logs.getLogger('message-processor')

  async function process(message: any) {
    log.debug('Processing', { message })

    const entity: Entity = await catalyst.getEntityById(
      message.entity.entityId,
      message.contentServerUrls.length ? message.contentServerUrls[0] : undefined
    )

    if (!entity) {
      log.error('Entity not found', { message: JSON.stringify(message) })
      return
    }
  }

  return { process }
}
