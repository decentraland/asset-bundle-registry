import { HandlerContextWithPath } from '../../types'

export async function flushCacheHandler(context: HandlerContextWithPath<'memoryStorage' | 'logs', '/flush-cache'>) {
  const {
    components: { memoryStorage, logs }
  } = context

  const logger = logs.getLogger('flush-cache-handler')

  await memoryStorage.flush('jobs:*')
  logger.info('Cache flushed')

  return {
    status: 200,
    body: {
      ok: true,
      message: 'Cache flushed'
    }
  }
}
