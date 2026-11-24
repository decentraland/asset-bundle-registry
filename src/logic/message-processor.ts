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
  RetryMessageData,
  MessageAttributes,
  EventContext
} from '../types'
import { createDeploymentEventHandler } from './handlers/deployment-handler'
import { createStatusEventHandler } from './handlers/status-handler'
import { createTexturesEventHandler } from './handlers/textures-handler'
import { createUndeploymentEventHandler } from './handlers/undeployment-handler'
import { createWorldUndeploymentEventHandler } from './handlers/world-undeployment-handler'
import { createSpawnCoordinateEventHandler } from './handlers/spawn-coordinate-handler'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import {
  isAllowedContentServerUrl,
  parseAllowedContentServerHosts,
  resolveSourceContentServerUrl,
  SourceRejectionReason,
  toBareOrigin,
  toContentServerOrigin
} from './validation'

export async function createMessageProcessorComponent({
  catalyst,
  worlds,
  registry,
  queuesStatusManager,
  coordinates,
  db,
  logs,
  config,
  metrics
}: Pick<
  AppComponents,
  'catalyst' | 'worlds' | 'registry' | 'queuesStatusManager' | 'db' | 'logs' | 'config' | 'coordinates' | 'metrics'
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

  // World event sources (sourceContentServerUrl). Every listed host must verify NAME ownership against
  // the same mainnet registry as the default server: world rows are keyed by world name and the last
  // deploy from any listed server wins (it rotates the other server's rows), while an undeploy only
  // removes the sending server's rows, so an undeploy from B leaves A's rows OBSOLETE until A redeploys.
  // Empty = only the default worlds server is accepted.
  const allowedWorldsContentServerHosts = parseAllowedContentServerHosts(
    await config.getString('ALLOWED_WORLDS_CONTENT_SERVER_HOSTS')
  )
  // Origins that mean the default worlds server (stored as NULL). WORLDS_CONTENT_SERVER_URL may be an
  // internal address, so the public base WCS emits is configured separately.
  const worldsContentServerUrl = await config.getString('WORLDS_CONTENT_SERVER_URL')
  const worldsContentServerPublicUrl = await config.getString('WORLDS_CONTENT_SERVER_PUBLIC_URL')
  const worldsContentServerPublicOrigin = worldsContentServerPublicUrl
    ? toBareOrigin(worldsContentServerPublicUrl)
    : undefined
  if (worldsContentServerPublicUrl && !worldsContentServerPublicOrigin) {
    throw new Error('WORLDS_CONTENT_SERVER_PUBLIC_URL must be a bare https origin')
  }
  const defaultWorldsContentServerOrigins = new Set(
    [worldsContentServerUrl && toContentServerOrigin(worldsContentServerUrl), worldsContentServerPublicOrigin].filter(
      (origin): origin is string => !!origin
    )
  )
  // Hosts a deployment may be fetched from: catalysts plus the public worlds servers.
  const allowedFetchHosts = new Set([
    ...allowedContentServerHosts,
    ...allowedWorldsContentServerHosts,
    ...(worldsContentServerPublicOrigin ? [new URL(worldsContentServerPublicOrigin).hostname] : [])
  ])

  function dropForSource(
    reason: SourceRejectionReason | 'source_mismatch',
    message: any,
    details: Record<string, string>
  ): MessageProcessorResult {
    log.error('Dropping world event: its source content server is not accepted', {
      reason,
      type: String(message?.type).slice(0, 60),
      subType: String(message?.subType).slice(0, 60),
      ...details
    })
    metrics.increment('world_events_dropped_total', { reason })
    return { ok: true, failedHandlers: [] }
  }

  const processors: IEventHandlerComponent<
    | DeploymentToSqs
    | AssetBundleConversionManuallyQueuedEvent
    | AssetBundleConversionFinishedEvent
    | WorldScenesUndeploymentEvent
    | WorldUndeploymentEvent
    | WorldSpawnCoordinateSetEvent
  >[] = [
    createDeploymentEventHandler({ catalyst, worlds, registry, db, logs }, allowedFetchHosts),
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

  async function process(message: any, attributes: MessageAttributes = {}): Promise<MessageProcessorResult> {
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
      ? message.contentServerUrls.find((url: string) => !isAllowedContentServerUrl(url, allowedFetchHosts))
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

    // World rows and removals are scoped to the server that sent them (see ALLOWED_WORLDS_CONTENT_SERVER_HOSTS).
    const source = resolveSourceContentServerUrl(
      attributes.sourceContentServerUrl,
      allowedWorldsContentServerHosts,
      defaultWorldsContentServerOrigins
    )
    if (source.ok === false) {
      return dropForSource(source.reason, message, {
        sourceContentServerUrl: String(attributes.sourceContentServerUrl).slice(0, 120)
      })
    }
    // The attribute is authoritative: a deployment fetched from another origin is mislabelled.
    if (source.origin !== undefined && Array.isArray(message?.contentServerUrls)) {
      const [fetchUrl] = message.contentServerUrls
      if (typeof fetchUrl !== 'string' || toContentServerOrigin(fetchUrl) !== source.origin) {
        return dropForSource('source_mismatch', message, {
          sourceContentServerUrl: source.origin,
          contentServerUrl: String(fetchUrl).slice(0, 120),
          entityId: String(message?.entity?.entityId).slice(0, 120)
        })
      }
    }
    const context: EventContext = { sourceContentServerUrl: source.sourceContentServerUrl }

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

    const results: EventHandlerResult[] = await Promise.all(handlers.map((handler) => handler.handle(message, context)))
    const failedProcessors: EventHandlerName[] = results.filter((r) => !r.ok).map((r) => r.handlerName)

    return {
      ok: failedProcessors.length === 0,
      failedHandlers: failedProcessors
    }
  }

  return { process }
}
