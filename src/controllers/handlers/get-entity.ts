import { HandlerContextWithPath, Registry } from '../../types'

export async function getActiveEntityHandler(context: HandlerContextWithPath<'db', '/entities/active'>) {
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

  // group by pointers
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

  return {
    body: JSON.stringify(entitiesByPointers),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
