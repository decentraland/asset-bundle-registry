import { Entity } from '@dcl/schemas'
import { AppComponents, EntityGetterComponent } from '../types'

export function createEntityGetterComponent({
  logs,
  catalyst
}: Pick<AppComponents, 'logs' | 'catalyst'>): EntityGetterComponent {
  const log = logs.getLogger('event-parser')

  async function extractEntityOrUndefined(message: any): Promise<Entity | undefined> {
    if (!Entity.validate(message.entity)) {
      log.debug('Entity received at event is not valid', {
        validation: Entity.validate.errors?.map((error) => JSON.stringify(error)).join(', ') || 'N/A'
      })

      return undefined
    }

    return message.entity
  }

  async function getEntityFrom(message: any): Promise<Entity> {
    log.debug('Extracting entity from message', { message })
    const entity: Entity =
      (await extractEntityOrUndefined(message)) ??
      (await catalyst.getEntityById(
        message.entity.entityId,
        message.contentServerUrls ? message.contentServerUrl[0] : undefined
      ))

    return entity
  }

  return { getEntityFrom }
}
