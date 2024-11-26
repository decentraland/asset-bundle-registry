import { Entity } from '@dcl/schemas'
import { AppComponents, MessageProcessorComponent } from '../types'

export async function createMessageProcessorComponent({
  entityGetter,
  logs
}: Pick<AppComponents, 'entityGetter' | 'logs' | 'config' | 'metrics'>): Promise<MessageProcessorComponent> {
  const log = logs.getLogger('message-processor')

  async function process(message: any) {
    log.debug('Processing', { message })

    const entity: Entity = await entityGetter.getEntityFrom(message)

    if (!entity) {
      log.error('Entity not found', { message: JSON.stringify(message) })
      return
    }
  }

  return { process }
}
