import { getMostUpdatedRegistryByPointers } from '../../logic/registry-parser'
import { HandlerContextWithPath, Registry } from '../../types'
import { bundlesWithWebglCompat, versionsWithWebglCompat } from '../../utils/webgl-compat'

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

  // Extract world_name from query parameters
  const worldName = context.url.searchParams.get('world_name') || undefined

  const entities = await db.getSortedRegistriesByPointers(pointers, {
    statuses: [Registry.Status.COMPLETE, Registry.Status.FALLBACK],
    worldName
  })

  const entitiesByPointers = getMostUpdatedRegistryByPointers(entities).map((entity) => ({
    pointers: entity.pointers,
    // WebGL was decommissioned; re-add its fields with defaults so the public API stays backward-compatible.
    versions: versionsWithWebglCompat(entity.versions),
    bundles: bundlesWithWebglCompat(entity.bundles),
    status: entity.status
  }))

  return {
    body: entitiesByPointers,
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
