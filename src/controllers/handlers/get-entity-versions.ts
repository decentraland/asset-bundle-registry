import { getMostUpdatedRegistryByPointers } from '../../logic/registry-parser'
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

  // Extract world_name from query parameters
  const worldName = context.url.searchParams.get('world_name') || undefined

  const entities = await db.getSortedRegistriesByPointers(
    pointers,
    [Registry.Status.COMPLETE, Registry.Status.FALLBACK],
    false,
    worldName
  )

  const entitiesByPointers: Pick<Registry.DbEntity, 'pointers' | 'versions' | 'bundles'>[] =
    getMostUpdatedRegistryByPointers(entities).map((entity) => ({
      pointers: entity.pointers,
      versions: entity.versions,
      bundles: entity.bundles,
      status: entity.status
    }))

  return {
    body: entitiesByPointers,
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
