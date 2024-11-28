import { Entity } from '@dcl/schemas'
import { AppComponents, EntityGetterComponent } from '../types'

export function createEntityGetterComponent({
  logs,
  catalyst
}: Pick<AppComponents, 'logs' | 'catalyst'>): EntityGetterComponent {
  const log = logs.getLogger('event-parser')

  async function extractEntityOrUndefined(message: any): Promise<Entity | undefined> {
    const parsedEntity: Entity = {
      ...message.entity,
      entityId: undefined,
      entityType: undefined,
      id: message.entity.entityId,
      type: message.entity.entityType,
      content: []
    }

    if (!Entity.validate(parsedEntity)) {
      log.debug('Entity received at event is not valid', {
        validation: Entity.validate.errors?.map((error) => JSON.stringify(error)).join(', ') || 'N/A'
      })

      return undefined
    }

    return parsedEntity
  }

  async function getEntityFrom(message: any): Promise<Entity> {
    log.debug('Extracting entity from message', { message })
    const entity: Entity =
      (await extractEntityOrUndefined(message)) ??
      (await catalyst.getEntityById(
        message.entity.entityId,
        message.contentServerUrls.length ? message.contentServerUrls[0] : undefined
      ))

    return entity
  }

  return { getEntityFrom }
}
