import { Entity } from '@dcl/schemas'
import { AppComponents, EventHandlerComponent, ProcessorResult, Registry } from '../../types'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { Authenticator } from '@dcl/crypto'

export const createDeploymentProcessor = ({
  db,
  catalyst,
  logs
}: Pick<AppComponents, 'db' | 'catalyst' | 'logs'>): EventHandlerComponent => {
  const logger = logs.getLogger('deployment-processor')

  return {
    process: async (event: DeploymentToSqs): Promise<ProcessorResult> => {
      const entity: Entity = await catalyst.getEntityById(
        event.entity.entityId,
        event.contentServerUrls?.length ? event.contentServerUrls[0] : undefined
      )

      if (!entity) {
        logger.error('Entity not found', { event: JSON.stringify(event) })
        return { ok: false, errors: [`Entity with id ${event.entity.entityId} was not found`] }
      }

      const defaultBundles: Registry.Bundles = {
        windows: Registry.BundleStatusValues.PENDING,
        mac: Registry.BundleStatusValues.PENDING,
        webglb: Registry.BundleStatusValues.PENDING
      }

      const deployer = Authenticator.ownerAddress(event.entity.authChain)

      await db.insertRegistry({ ...entity, deployer, status: Registry.BundleStatusValues.PENDING, bundles: defaultBundles })

      logger.debug('Deployment saved', { entityId: entity.id })

      return { ok: true }
    },
    canProcess: (event: any): boolean => {
      DeploymentToSqs.validate(event)

      return !DeploymentToSqs.validate.errors?.length
    },
    name: 'Deployment Processor'
  }
}
