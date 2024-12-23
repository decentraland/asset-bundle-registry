import { AppComponents, EventHandlerComponent, MessageProcessorComponent } from '../types'
import { createDeploymentProcessor } from './processors/deployment-processor'
import { createTexturesProcessor } from './processors/textures-processor'

export async function createMessageProcessorComponent({
  catalyst,
  entityStatusFetcher,
  registryOrchestrator,
  db,
  logs
}: Pick<
  AppComponents,
  'catalyst' | 'entityStatusFetcher' | 'registryOrchestrator' | 'db' | 'logs'
>): Promise<MessageProcessorComponent> {
  const log = logs.getLogger('message-processor')
  const processors: EventHandlerComponent[] = [
    createDeploymentProcessor({ catalyst, logs, registryOrchestrator }),
    createTexturesProcessor({ db, logs, catalyst, entityStatusFetcher, registryOrchestrator })
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
