import { AppComponents, EventHandlerComponent, MessageProcessorComponent } from '../types'
import { createDeploymentProcessor } from './processors/deployment-processor'
import { createStatusProcessor } from './processors/status-processor'
import { createTexturesProcessor } from './processors/textures-processor'

export async function createMessageProcessorComponent({
  catalyst,
  entityStatusFetcher,
  registryOrchestrator,
  db,
  logs,
  config,
  fetch,
  memoryStorage
}: Pick<
  AppComponents,
  'catalyst' | 'entityStatusFetcher' | 'registryOrchestrator' | 'db' | 'logs' | 'config' | 'fetch' | 'memoryStorage'
>): Promise<MessageProcessorComponent> {
  const log = logs.getLogger('message-processor')
  const processors: EventHandlerComponent[] = [
    createDeploymentProcessor({ catalyst, logs, registryOrchestrator }),
    createTexturesProcessor({ db, logs, catalyst, entityStatusFetcher, registryOrchestrator, memoryStorage }),
    await createStatusProcessor({ logs, config, fetch, memoryStorage })
  ]

  async function process(message: any) {
    log.debug('Processing', { message })

    const handlers: EventHandlerComponent[] | undefined = processors.filter((p) => p.canProcess(message))

    if (!handlers) {
      log.warn('No handler found for the message', { message })
      return
    }

    await Promise.all(
      handlers.map((handler) =>
        handler.process(message).catch((error) => {
          log.error('Failed to process', {
            error: error?.message || 'Unexpected processor failure',
            stack: JSON.stringify(error?.stack)
          })

          return { ok: false, errors: [error?.message || 'Unexpected processor failure'] }
        })
      )
    )
  }

  return { process }
}
