import { HandlerContextWithPath, Registry } from '../../types'

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

  // Track the number of pointers in this request
  metrics.observe('pointers_per_request', {}, pointers.length)

  const entities = await db.getSortedRegistriesByPointers(pointers, [
    Registry.Status.COMPLETE,
    Registry.Status.FALLBACK
  ])

  if (entities.length === 0) {
    pointers.forEach((_pointer) => {
      metrics.increment('registries_missmatch_count', {}, 1)
    })
  }

  const groupByWholePointers = entities.reduce(
    (acc, entity) => {
      const key = entity.pointers.join(',')
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(entity)
      return acc
    },
    {} as Record<string, Registry.DbEntity[]>
  )

  // get first element of each group
  const entitiesByPointers = Object.values(groupByWholePointers).map((group) => (group.length ? group[0] : undefined))
  metrics.increment('registries_served_count', {}, entitiesByPointers.length)

  return {
    body: JSON.stringify(entitiesByPointers),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
