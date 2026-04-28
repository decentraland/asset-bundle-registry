import { HandlerContextWithPath } from '../../types'

export async function getDenylistHandler(context: HandlerContextWithPath<'db', '/denylist'>) {
  const {
    components: { db }
  } = context

  const entries = await db.getDenylist()

  return {
    body: entries
  }
}
