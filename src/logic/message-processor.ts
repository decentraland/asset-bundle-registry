import { AppComponents, EventHandlerComponent, MessageProcessorComponent } from '../types'
import { createDeploymentProcessor } from './processors/deployment-processor'
import { createTexturesProcessor } from './processors/textures-processor'

export async function createMessageProcessorComponent({
  catalyst,
  db,
  logs
}: Pick<AppComponents, 'catalyst' | 'db' | 'logs' | 'config' | 'metrics'>): Promise<MessageProcessorComponent> {
  const log = logs.getLogger('message-processor')
  const processors: EventHandlerComponent[] = [
    createDeploymentProcessor({ db, catalyst, logs }),
    createTexturesProcessor({ db, logs })
  ]

  async function process(message: any) {
    log.debug('Processing', { message })

    const handler: EventHandlerComponent | undefined = processors.find((p) => p.canProcess(message))

    if (!handler) {
      log.warn('No handler found for the message', { message })
      return
    }

    await handler.process(message)
  }

  return { process }
}
