import { HandlerContextWithPath } from '../../types'

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

  return {
    body: JSON.stringify(entities),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
