import { Entity } from '@dcl/schemas'
import { AppComponents, IEventHandlerComponent, EventHandlerName, EventHandlerResult, Registry } from '../../types'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { Authenticator } from '@dcl/crypto'
import { isAllowedContentServerUrl } from '../validation'

export const createDeploymentEventHandler = (
  { registry, catalyst, worlds, db, logs }: Pick<AppComponents, 'catalyst' | 'worlds' | 'db' | 'logs' | 'registry'>,
  allowedContentServerHosts: Set<string>
): IEventHandlerComponent<DeploymentToSqs> => {
  const HANDLER_NAME = EventHandlerName.DEPLOYMENT
  const logger = logs.getLogger('deployment-handler')

  return {
    handle: async (event: DeploymentToSqs): Promise<EventHandlerResult> => {
      let entity: Entity | null
      try {
        // SSRF guard (issue #306): contentServerUrls rides in the SQS payload and
        // the entity is fetched from it (catalyst / worlds), so reject any
        // off-allowlist host and skip the event (ok: true — deterministic, so
        // retrying wouldn't help). Validate EVERY entry, not just [0]: the whole
        // array is preserved in the message. entityId isn't gated here: it only
        // reaches parameterized SQL / cache keys, not a filesystem path or S3 key.
        const disallowedContentServerUrl = event.contentServerUrls?.find(
          (url) => !isAllowedContentServerUrl(url, allowedContentServerHosts)
        )
        if (disallowedContentServerUrl) {
          logger.warn('Skipping deployment: a contentServerUrl is not an allowed content server (SSRF guard)', {
            entityId: event.entity.entityId,
            contentServerUrl: String(disallowedContentServerUrl).slice(0, 120)
          })
          return { ok: true, handlerName: HANDLER_NAME }
        }

        const registryAlreadyExists = await db.getRegistryById(event.entity.entityId)

        if (registryAlreadyExists) {
          logger.warn('Registry already exists, will not process deployment', { event: JSON.stringify(event) })
          return {
            ok: true,
            handlerName: HANDLER_NAME
          }
        }

        if (worlds.isWorldDeployment(event)) {
          const [worldContentServerUrl] = event.contentServerUrls!
          entity = await worlds.getWorld(event.entity.entityId, worldContentServerUrl)
        } else {
          entity = await catalyst.getEntityById(event.entity.entityId, {
            overrideContentServerUrl: event.contentServerUrls?.length ? event.contentServerUrls[0] : undefined
          })
        }

        if (!entity) {
          logger.error('Entity not found', { event: JSON.stringify(event) })
          return {
            ok: false,
            errors: [`Entity with id ${event.entity.entityId} was not found`],
            handlerName: HANDLER_NAME
          }
        }

        const defaultBundles: Registry.Bundles = {
          assets: {
            windows: Registry.SimplifiedStatus.PENDING,
            mac: Registry.SimplifiedStatus.PENDING,
            webgl: Registry.SimplifiedStatus.PENDING
          },
          lods: {
            windows: Registry.SimplifiedStatus.PENDING,
            mac: Registry.SimplifiedStatus.PENDING,
            webgl: Registry.SimplifiedStatus.PENDING
          }
        }

        const defaultVersions: Registry.Versions = {
          assets: {
            windows: { version: '', buildDate: '' },
            mac: { version: '', buildDate: '' },
            webgl: { version: '', buildDate: '' }
          }
        }

        const deployer = Authenticator.ownerAddress(event.entity.authChain)
        await registry.persistAndRotateStates({
          ...entity,
          deployer,
          bundles: defaultBundles,
          versions: defaultVersions
        })

        return { ok: true, handlerName: HANDLER_NAME }
      } catch (error: any) {
        logger.error('Failed to process', {
          error: error?.message || 'Unexpected processor failure',
          stack: JSON.stringify(error?.stack)
        })

        return { ok: false, errors: [error?.message || 'Unexpected processor failure'], handlerName: HANDLER_NAME }
      }
    },
    canHandle: (event: any): boolean => {
      DeploymentToSqs.validate(event)

      return !DeploymentToSqs.validate.errors?.length
    },
    name: HANDLER_NAME
  }
}
