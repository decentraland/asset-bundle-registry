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
import { isAllowedContentServerUrl, parseAllowedContentServerHosts } from './validation'

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

  // Strict host allowlist for the (attacker-influenced) deployment content-server
  // URL (issue #306). Sourced entirely from ALLOWED_CONTENT_SERVER_HOSTS (set per-env in the
  // definitions repo) — required, with no built-in fallback list.
  const allowedContentServerHosts = parseAllowedContentServerHosts(
    await config.requireString('ALLOWED_CONTENT_SERVER_HOSTS')
  )
  if (allowedContentServerHosts.size === 0) {
    throw new Error('ALLOWED_CONTENT_SERVER_HOSTS is set but contains no valid catalyst hosts')
  }
  const processors: IEventHandlerComponent<
    | DeploymentToSqs
    | AssetBundleConversionManuallyQueuedEvent
    | AssetBundleConversionFinishedEvent
    | WorldScenesUndeploymentEvent
    | WorldUndeploymentEvent
    | WorldSpawnCoordinateSetEvent
  >[] = [
    createDeploymentEventHandler({ catalyst, worlds, registry, db, logs }, allowedContentServerHosts),
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

    // SSRF / poisoned-message guard at the dispatch level (issue #306): a
    // deployment carrying an off-allowlist content-server host is dropped before
    // ANY handler runs. The deployment handler already skips it, but other
    // handlers (e.g. status) would otherwise still act on it and leave an
    // orphaned queue-status entry. Drop it (ok, no retry) — it's deterministic.
    const disallowedContentServerUrl = Array.isArray(message?.contentServerUrls)
      ? message.contentServerUrls.find((url: string) => !isAllowedContentServerUrl(url, allowedContentServerHosts))
      : undefined
    if (disallowedContentServerUrl) {
      log.warn('Dropping message: a contentServerUrl is not an allowed content server (SSRF/allowlist guard)', {
        entityId: message?.entity?.entityId,
        contentServerUrl: String(disallowedContentServerUrl).slice(0, 120)
      })
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
