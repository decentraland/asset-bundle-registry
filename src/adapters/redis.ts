import { createClient } from 'redis'
import { AppComponents, ICacheStorage } from '../types'

const TWENTY_FOUR_HOURS_IN_SECONDS = 60 * 60 * 24

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

  async function get(pattern: string): Promise<string[]> {
    try {
      const keys = await client.keys(pattern)
      return keys.map((key) => key.split(':').pop()!)
    } catch (err: any) {
      logger.error(`Error getting key "${pattern}"`, err)
      throw err
    }
  }

  async function set<T>(key: string, value: T): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value)
      await client.set(key, serializedValue, {
        EX: TWENTY_FOUR_HOURS_IN_SECONDS // expiration time (TTL)
      })
      logger.debug(`Successfully set key "${key}"`)
    } catch (err: any) {
      logger.error(`Error setting key "${key}"`, err)
      throw err
    }
  }

  async function purge(key: string): Promise<void> {
    try {
      await client.del(key)
      logger.debug(`Successfully purged key "${key}"`)
    } catch (err: any) {
      logger.error(`Error purging key "${key}"`, err)
      throw err
    }
  }

  return {
    get,
    set,
    purge,
    start,
    stop
  }
}
