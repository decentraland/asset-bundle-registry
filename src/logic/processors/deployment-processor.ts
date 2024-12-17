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
        assets: {
          windows: Registry.Status.PENDING,
          mac: Registry.Status.PENDING,
          webgl: Registry.Status.PENDING
        },
        lods: {
          windows: Registry.Status.PENDING,
          mac: Registry.Status.PENDING,
          webgl: Registry.Status.PENDING
        }
      }

      const deployer = Authenticator.ownerAddress(event.entity.authChain)

      const relatedEntities = await db.getRelatedRegistries(entity)

      const splitRelatedEntities = relatedEntities?.reduce(
        (acc: any, relatedEntity: Registry.PartialDbEntity) => {
          if (relatedEntity.timestamp > entity.timestamp) {
            acc.newerEntities.push(relatedEntity)
          } else {
            acc.olderEntities.push(relatedEntity)
          }

          return acc
        },
        { newerEntities: [] as Registry.PartialDbEntity[], olderEntities: [] as Registry.PartialDbEntity[] }
      )

      await db.insertRegistry({
        ...entity,
        deployer,
        status: Registry.Status.PENDING,
        bundles: defaultBundles,
        isLatest: !splitRelatedEntities.newerEntities.length
      })

      logger.debug('Deployment saved', { entityId: entity.id })

      if (splitRelatedEntities.olderEntities.length) {
        const olderEntitiesIds = splitRelatedEntities.olderEntities.map((entity: Registry.PartialDbEntity) => entity.id)
        logger.debug('Marking older entities as outdated', {
          newEntityId: entity.id,
          olderEntitiesIds
        })

        await db.markRegistriesAsOutdated(olderEntitiesIds)
      }

      return { ok: true }
    },
    canProcess: (event: any): boolean => {
      DeploymentToSqs.validate(event)

      return !DeploymentToSqs.validate.errors?.length
    },
    name: 'Deployment Processor'
  }
}
