import { Entity } from '@dcl/schemas'
import { AppComponents, IWorldsComponent } from '../types'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'

export async function createWorldsAdapter({
  logs,
  config,
  fetch,
  pointers
}: Pick<AppComponents, 'logs' | 'config' | 'fetch' | 'pointers'>): Promise<IWorldsComponent> {
  const logger = logs.getLogger('worlds-adapter')
  const defaultWorldsContentServerUrl = await config.requireString('WORLDS_CONTENT_SERVER_URL')

  /**
   * Fetches a world entity by its entity id.
   * For multi-scene worlds, pointers are transformed to world-prefixed format (worldname:coordinate).
   * For single-scene worlds, the world name is used as the pointer (backward compatible).
   *
   * @param entityId - The world entity ID
   * @param contentServerUrl - The world content server URL
   * @returns The world entity with transformed pointers or null
   */
  async function getWorld(
    entityId: string,
    contentServerUrl: string = defaultWorldsContentServerUrl
  ): Promise<Entity | null> {
    try {
      const url = `${contentServerUrl}/contents/${entityId}`
      const response = await fetch.fetch(url)

      if (!response.ok) {
        return null
      }

      const parsedResponse = await response.json()
      const worldName = parsedResponse.metadata?.worldConfiguration?.name

      if (!worldName) {
        logger.error('World entity missing worldConfiguration.name', { entityId })
        return null
      }

      // Get the original pointers from the entity
      const originalPointers: string[] = parsedResponse.pointers || []

      // Transform pointers to world-prefixed format if they are coordinates
      const transformedPointers = pointers.transformWorldPointers(worldName, originalPointers)

      logger.debug('Transformed world pointers', {
        entityId,
        worldName,
        originalPointers: originalPointers.join(', '),
        transformedPointers: transformedPointers.join(', ')
      })

      return {
        ...parsedResponse,
        id: entityId,
        type: 'world',
        pointers: transformedPointers
      }
    } catch (error: any) {
      logger.error('Error fetching world', { entityId, error: error?.message || 'Unknown error' })
      return null
    }
  }

  /**
   * Determines if a deployment event is from a world content server
   * @param event - The deployment event
   * @returns true if this is a world deployment
   */
  function isWorldDeployment(event: DeploymentToSqs): boolean {
    return (
      !!event.contentServerUrls &&
      !!event.contentServerUrls[0] &&
      event.contentServerUrls[0].includes('worlds-content-server')
    )
  }

  return {
    getWorld,
    isWorldDeployment
  }
}
