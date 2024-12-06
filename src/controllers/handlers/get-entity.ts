import { HandlerContextWithPath, Registry } from '../../types'

export async function getEntityHandler(context: HandlerContextWithPath<'db', '/entities/active'>) {
  const {
    components: { db }
  } = context

  const body = await context.request.json()
  const pointers = body.pointers

  if (pointers?.length === 0) {
    return {
      status: 400,
      body: {
        ok: false,
        message: 'No pointers provided'
      }
    }
  }

  const entities = await db.getRegistriesByPointers(pointers)

  if (!entities) {
    return {
      status: 404,
      body: {
        ok: false,
        message: 'Entities not found'
      }
    }
  }

  const entityToReturn: Registry.DbEntity | undefined = entities
    .filter((entity) => entity.status === Registry.StatusValues.OPTMIZED)
    ?.sort((a, b) => a.timestamp - b.timestamp)[0]

  if (!entityToReturn) {
    return {
      status: 404,
      body: {
        ok: false,
        message: 'No active entities found'
      }
    }
  }

  return {
    body: JSON.stringify(entities)
  }
}
