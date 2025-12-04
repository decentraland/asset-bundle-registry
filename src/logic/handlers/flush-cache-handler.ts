import { HandlerContextWithPath } from '../../types'
import { SYNC_STATE_KEY } from '../../types/constants'

export async function flushCacheHandler(
  context: HandlerContextWithPath<'memoryStorage' | 'logs', '/flush-cache/:type'>
) {
  const {
    components: { memoryStorage, logs }
  } = context

  const logger = logs.getLogger('flush-cache-handler')
  const type = context.params.type

  switch (type) {
    case 'jobs':
      await memoryStorage.flush('jobs:*')
      logger.info('Cache flushed for jobs')
      break
    case 'profiles-cursor':
      await memoryStorage.flush(SYNC_STATE_KEY)
      logger.info('Cache flushed for profiles cursor')
      break
    default:
      return {
        status: 400,
        body: {
          error: 'Invalid cache type'
        }
      }
  }

  return {
    status: 200,
    body: {
      ok: true,
      message: 'Cache flushed'
    }
  }
}
