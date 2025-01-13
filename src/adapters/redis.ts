import { createClient } from 'redis'
import { AppComponents, ICacheStorage } from '../types'

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

  async function getDeployments(key: string): Promise<string[]> {
    try {
      const deployments = await client.sMembers(key)
      logger.debug(`Successfully fetched deployments for "${key}`)
      return deployments
    } catch (err: any) {
      logger.error(`Error getting deployments for "${key}"`, err)
      throw err
    }
  }

  async function addDeployment(key: string, entityId: string): Promise<void> {
    try {
      await client.sAdd(key, entityId)
      logger.debug(`Successfully added deployment "${entityId}" to "${key}"`)
    } catch (err: any) {
      logger.error(`Error adding deployment "${entityId}" to "${key}"`, err)
      throw err
    }
  }

  async function removeDeployment(key: string, entityId: string): Promise<void> {
    try {
      await client.sRem(key, entityId)
      logger.debug(`Successfully removed deployment "${entityId}" from "${key}"`)
    } catch (err: any) {
      logger.error(`Error removing deployment "${entityId}" from "${key}"`, err)
      throw err
    }
  }

  return {
    getDeployments,
    addDeployment,
    removeDeployment,
    start,
    stop
  }
}
