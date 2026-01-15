import { getMostUpdatedRegistryByPointers } from '../../logic/registry-parser'
import { HandlerContextWithPath, Registry } from '../../types'
import * as Sentry from '@sentry/node'

export async function getActiveEntityHandler(context: HandlerContextWithPath<'db' | 'metrics', '/entities/active'>) {
  const {
    components: { db, metrics }
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

  Sentry.captureException(new Error('test'))

  // Track the number of pointers in this request
  metrics.observe('pointers_per_request', {}, pointers.length)

  const entities = await db.getSortedRegistriesByPointers(pointers, [
    Registry.Status.COMPLETE,
    Registry.Status.FALLBACK
  ])

  if (entities.length === 0) {
    metrics.increment('registries_missmatch_count', {}, pointers.length)
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
