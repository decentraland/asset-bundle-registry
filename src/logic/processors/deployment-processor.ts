import { Entity } from '@dcl/schemas'
import { AppComponents, EventHandlerComponent, ProcessorResult, Registry } from '../../types'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { Authenticator } from '@dcl/crypto'

export const createDeploymentProcessor = ({
  registryOrchestrator,
  catalyst,
  fetch,
  logs
}: Pick<AppComponents, 'registryOrchestrator' | 'catalyst' | 'fetch' | 'logs'>): EventHandlerComponent => {
  const logger = logs.getLogger('deployment-processor')

  function isWorldDeployment(event: DeploymentToSqs): boolean {
    return (
      !!event.contentServerUrls &&
      !!event.contentServerUrls[0] &&
      event.contentServerUrls[0].includes('worlds-content-server')
    )
  }

  async function fetchEntityFromWorldContentServer(event: DeploymentToSqs): Promise<Entity | null> {
    const url = `${event.contentServerUrls![0]}/contents/${event.entity.entityId}`
    const response = await fetch.fetch(url)

    if (!response.ok) {
      return null
    }

    const parsedResponse = await response.json()

    // real pointers for scene rendering are already stored in metadata
    // this override happens to store a proper lookable value at pointers column (world name)
    return { ...parsedResponse, type: 'world', pointers: parsedResponse.metadata.worldConfiguration.name }
  }

  return {
    process: async (event: DeploymentToSqs): Promise<ProcessorResult> => {
      let entity: Entity | null
      try {
        if (isWorldDeployment(event)) {
          entity = await fetchEntityFromWorldContentServer(event)
        } else {
          entity = await catalyst.getEntityById(
            event.entity.entityId,
            event.contentServerUrls?.length ? event.contentServerUrls[0] : undefined
          )
        }

        if (!entity) {
          logger.error('Entity not found', { event: JSON.stringify(event) })
          return { ok: false, errors: [`Entity with id ${event.entity.entityId} was not found`] }
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

        const deployer = Authenticator.ownerAddress(event.entity.authChain)
        await registryOrchestrator.persistAndRotateStates({
          ...entity,
          deployer,
          bundles: defaultBundles
        })

        return { ok: true }
      } catch (error: any) {
        logger.error('Failed to process', {
          error: error?.message || 'Unexpected processor failure',
          stack: JSON.stringify(error?.stack)
        })

        return { ok: false, errors: [error?.message || 'Unexpected processor failure'] }
      }
    },
    canProcess: (event: any): boolean => {
      DeploymentToSqs.validate(event)

      return !DeploymentToSqs.validate.errors?.length
    },
    name: 'Deployment Processor'
  }
}
