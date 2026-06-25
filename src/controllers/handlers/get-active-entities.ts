import { getMostUpdatedRegistryByPointers } from '../../logic/registry-parser'
import { HandlerContextWithPath, Registry } from '../../types'
import { withWebglCompat } from '../../utils/webgl-compat'

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

  // Extract world_name from query parameters
  const worldName = context.url.searchParams.get('world_name') || undefined

  // Track the number of pointers in this request
  metrics.observe('pointers_per_request', {}, pointers.length)

  const entities = await db.getSortedRegistriesByPointers(pointers, {
    statuses: [Registry.Status.COMPLETE, Registry.Status.FALLBACK],
    worldName,
    excludeDenylisted: true
  })

  if (entities.length === 0) {
    metrics.increment('registries_missmatch_count', {}, pointers.length)
  }

  const entitiesByPointers = getMostUpdatedRegistryByPointers<Registry.DbEntity>(entities)
  metrics.increment('registries_served_count', {}, entitiesByPointers.length)

  return {
    // WebGL was decommissioned; re-add its fields with defaults so the public API stays backward-compatible.
    body: entitiesByPointers.map(withWebglCompat),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
