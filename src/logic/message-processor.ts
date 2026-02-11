import {
  AssetBundleConversionFinishedEvent,
  AssetBundleConversionManuallyQueuedEvent,
  WorldScenesUndeploymentEvent,
  WorldUndeploymentEvent,
  WorldSpawnCoordinateSetEvent
} from '@dcl/schemas'
import {
  AppComponents,
  IEventHandlerComponent,
  EventHandlerName,
  IMessageProcessorComponent,
  MessageProcessorResult,
  EventHandlerResult,
  RetryMessageData
} from '../types'
import { createDeploymentEventHandler } from './handlers/deployment-handler'
import { createStatusEventHandler } from './handlers/status-handler'
import { createTexturesEventHandler } from './handlers/textures-handler'
import { createUndeploymentEventHandler } from './handlers/undeployment-handler'
import { createWorldUndeploymentEventHandler } from './handlers/world-undeployment-handler'
import { createSpawnCoordinateEventHandler } from './handlers/spawn-coordinate-handler'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'

export async function createMessageProcessorComponent({
  catalyst,
  worlds,
  registry,
  queuesStatusManager,
  coordinates,
  db,
  logs,
  config
}: Pick<
  AppComponents,
  'catalyst' | 'worlds' | 'registry' | 'queuesStatusManager' | 'db' | 'logs' | 'config' | 'coordinates'
>): Promise<IMessageProcessorComponent> {
  const MAX_RETRIES: number = (await config.getNumber('MAX_RETRIES')) || 3
  const log = logs.getLogger('message-processor')
  const processors: IEventHandlerComponent<
    | DeploymentToSqs
    | AssetBundleConversionManuallyQueuedEvent
    | AssetBundleConversionFinishedEvent
    | WorldScenesUndeploymentEvent
    | WorldUndeploymentEvent
    | WorldSpawnCoordinateSetEvent
  >[] = [
    createDeploymentEventHandler({ catalyst, worlds, registry, db, logs }),
    createTexturesEventHandler({
      db,
      logs,
      catalyst,
      worlds,
      registry,
      queuesStatusManager,
      coordinates
    }),
    createStatusEventHandler({ logs, queuesStatusManager }),
    createUndeploymentEventHandler({ registry, logs }),
    createWorldUndeploymentEventHandler({ registry, logs }),
    createSpawnCoordinateEventHandler({ coordinates, logs })
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

    const handlers:
      | IEventHandlerComponent<
          | DeploymentToSqs
          | AssetBundleConversionManuallyQueuedEvent
          | AssetBundleConversionFinishedEvent
          | WorldScenesUndeploymentEvent
          | WorldUndeploymentEvent
          | WorldSpawnCoordinateSetEvent
        >[]
      | undefined = processors.filter(
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
