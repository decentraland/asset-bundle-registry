import { AppComponents, EventHandlerComponent, MessageProcessorComponent } from '../types'
import { createDeploymentProcessor } from './processors/deployment-processor'
import { createStatusProcessor } from './processors/status-processor'
import { createTexturesProcessor } from './processors/textures-processor'

export async function createMessageProcessorComponent({
  catalyst,
  worlds,
  entityStatusFetcher,
  registryOrchestrator,
  db,
  logs,
  queuesStatusManager
}: Pick<
  AppComponents,
  'catalyst' | 'worlds' | 'entityStatusFetcher' | 'registryOrchestrator' | 'db' | 'logs' | 'queuesStatusManager'
>): Promise<MessageProcessorComponent> {
  const log = logs.getLogger('message-processor')
  const processors: EventHandlerComponent[] = [
    createDeploymentProcessor({ catalyst, worlds, logs, registryOrchestrator }),
    createTexturesProcessor({
      db,
      logs,
      catalyst,
      worlds,
      entityStatusFetcher,
      registryOrchestrator,
      queuesStatusManager
    }),
    createStatusProcessor({ logs, queuesStatusManager })
  ]

  async function process(message: any) {
    log.debug('Processing', { message })

    const handlers: EventHandlerComponent[] | undefined = processors.filter((p) => p.canProcess(message))

    if (!handlers) {
      log.warn('No handler found for the message', { message })
      return
    }

    await Promise.all(handlers.map((handler) => handler.process(message)))
  }

  return { process }
}
