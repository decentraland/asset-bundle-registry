import { createClient } from 'redis'
import { AppComponents, ICacheStorage } from '../types'

const SEVEN_DAYS_IN_SECONDS = 60 * 60 * 24 * 7

export async function createRedisComponent(
  hostUrl: string,
  components: Pick<AppComponents, 'logs'>
): Promise<ICacheStorage> {
  const { logs } = components
  const logger = logs.getLogger('redis-component')
  const parsedUrl = `redis://${hostUrl}:6379`

  const client = createClient({
    url: parsedUrl
  })

  client.on('error', (err) => {
    logger.error(err)
  })

  async function start() {
    try {
      logger.debug('Connecting to Redis', { parsedUrl })
      await client.connect()
      logger.debug('Successfully connected to Redis')
    } catch (err: any) {
      logger.error('Error connecting to Redis', err)
      throw err
    }
  }

  async function stop() {
    try {
      logger.debug('Disconnecting from Redis')
      await client.disconnect()
      logger.debug('Successfully disconnected from Redis')
    } catch (err: any) {
      logger.error('Error disconnecting from Redis', err)
    }
  }

  async function get<T>(pattern: string): Promise<T[]> {
    try {
      const keys = await client.keys(pattern)
      if (keys.length === 0) {
        return []
      }
      const values = (await client.mGet(keys)) || []
      return values.map((value: any) => JSON.parse(value))
    } catch (err: any) {
      logger.error(`Error getting key "${pattern}"`, err)
      throw err
    }
  }

  async function set<T>(key: string, value: T): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value)
      await client.set(key, serializedValue, {
        EX: SEVEN_DAYS_IN_SECONDS // expiration time (TTL)
      })
      logger.debug(`Successfully set key "${key}"`)
    } catch (err: any) {
      logger.error(`Error setting key "${key}"`, err)
      throw err
    }
  }

  async function purge(key: string): Promise<void> {
    try {
      // check if key exists before deleting it
      const exists = await client.exists(key)
      if (exists) {
        await client.del(key)
        logger.debug(`Successfully purged key "${key}"`)
      }
    } catch (err: any) {
      logger.error(`Error purging key "${key}"`, err)
      throw err
    }
  }

  async function flush(pattern: string): Promise<void> {
    try {
      const keys = await client.keys(pattern)
      if (keys.length === 0) {
        logger.debug(`No keys found matching pattern "${pattern}"`)
        return
      }

      await client.del(keys)
      logger.debug(`Successfully flushed ${keys.length} keys matching pattern "${pattern}"`)
    } catch (err: any) {
      logger.error(`Error flushing keys matching pattern "${pattern}"`, err)
      throw err
    }
  }

  return {
    get,
    set,
    purge,
    flush,
    start,
    stop
  }
}
