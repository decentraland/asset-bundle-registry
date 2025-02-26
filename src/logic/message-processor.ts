import {
  AppComponents,
  EventHandlerComponent,
  EventHandlerName,
  MessageProcessorComponent,
  MessageProcessorResult,
  EventHandlerResult,
  RetryMessageData
} from '../types'
import { createDeploymentEventHandler } from './handlers/deployment-handler'
import { createStatusEventHandler } from './handlers/status-handler'
import { createTexturesEventHandler } from './handlers/textures-handler'

export async function createMessageProcessorComponent({
  catalyst,
  worlds,
  registryOrchestrator,
  queuesStatusManager,
  db,
  logs,
  config
}: Pick<
  AppComponents,
  'catalyst' | 'worlds' | 'registryOrchestrator' | 'queuesStatusManager' | 'db' | 'logs' | 'config'
>): Promise<MessageProcessorComponent> {
  const MAX_RETRIES: number = (await config.getNumber('MAX_RETRIES')) || 3
  const log = logs.getLogger('message-processor')
  const processors: EventHandlerComponent<any>[] = [
    createDeploymentEventHandler({ catalyst, worlds, registryOrchestrator, db, logs }),
    createTexturesEventHandler({
      db,
      logs,
      catalyst,
      worlds,
      registryOrchestrator,
      queuesStatusManager
    }),
    createStatusEventHandler({ logs, queuesStatusManager })
  ]

  async function process(message: any): Promise<MessageProcessorResult> {
    const retryData: RetryMessageData = message.retry || {
      attempt: 0,
      failedHandlers: []
    }

    if (retryData.attempt >= MAX_RETRIES) {
      log.warn('Max retries reached for the message, will not retry', { message })
      return {
        ok: true,
        failedHandlers: []
      }
    }

    log.debug('Processing', { message })

    const handlers: EventHandlerComponent<any>[] | undefined = processors.filter(
      (p) =>
        p.canHandle(message) && (retryData.failedHandlers.length === 0 || retryData.failedHandlers.includes(p.name))
    )

    if (!handlers || handlers.length === 0) {
      log.warn('No handler found for the message, will not retry', { message })
      return {
        ok: true,
        failedHandlers: []
      }
    }

    const results: EventHandlerResult[] = await Promise.all(handlers.map((handler) => handler.handle(message)))
    const failedProcessors: EventHandlerName[] = results.filter((r) => !r.ok).map((r) => r.handlerName)

    return {
      ok: failedProcessors.length === 0,
      failedHandlers: failedProcessors
    }
  }

  return { process }
}
