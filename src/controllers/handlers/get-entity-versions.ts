import { getMostUpdatedRegistryByPointers } from '../../logic/entity-parser'
import { HandlerContextWithPath, Registry } from '../../types'

export async function getEntityVersionsHandler(context: HandlerContextWithPath<'db', '/entities/versions'>) {
  const {
    components: { db }
  } = context

  const body = await context.request.json()
  const pointers: string[] = body.pointers

  if (!pointers || pointers?.length === 0) {
    return {
      status: 400,
      body: {
        ok: false,
        message: 'No pointers provided'
      }
    }
  }

  const entities = await db.getSortedRegistriesByPointers(pointers, [
    Registry.Status.COMPLETE,
    Registry.Status.FALLBACK
  ])

  const entitiesByPointers = getMostUpdatedRegistryByPointers(entities)

  return {
    body: JSON.stringify(entitiesByPointers),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
