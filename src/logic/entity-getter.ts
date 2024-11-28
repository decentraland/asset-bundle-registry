import { Entity } from '@dcl/schemas'
import { AppComponents, EntityGetterComponent } from '../types'

export function createEntityGetterComponent({ catalyst }: Pick<AppComponents, 'catalyst'>): EntityGetterComponent {
  async function getEntityFrom(message: any): Promise<Entity> {
    return await catalyst.getEntityById(
      message.entity.entityId,
      message.contentServerUrls.length ? message.contentServerUrls[0] : undefined
    )
  }

  return { getEntityFrom }
}
