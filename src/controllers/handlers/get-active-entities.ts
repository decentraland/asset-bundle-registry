import { getMostUpdatedRegistryByPointers } from '../../logic/registry-parser'
import { HandlerContextWithPath, Registry } from '../../types'

export async function getActiveEntityHandler(
  context: HandlerContextWithPath<'logs' | 'db' | 'metrics', '/entities/active'>
) {
  const {
    components: { db, metrics, logs }
  } = context

  const logger = logs.getLogger('get-active-entities-handler')

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

  // Track the number of pointers in this request
  metrics.observe('pointers_per_request', {}, pointers.length)

  const entities = await db.getSortedRegistriesByPointers(pointers, [
    Registry.Status.COMPLETE,
    Registry.Status.FALLBACK
  ])

  if (entities.length === 0) {
    logger.warn('Sample of not found pointers', { pointer: pointers[0], totalPointers: pointers.length })
    pointers.forEach((_pointer) => {
      metrics.increment('registries_missmatch_count', {}, 1)
    })
  }

  const entitiesByPointers = getMostUpdatedRegistryByPointers<Registry.DbEntity>(entities)
  metrics.increment('registries_served_count', {}, entitiesByPointers.length)

  return {
    body: entitiesByPointers,
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
