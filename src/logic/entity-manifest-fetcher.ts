import { AppComponents, EntityManifestFetcherComponent, Manifest } from '../types'

export async function createEntityManifestFetcherComponent({
  fetch,
  logs,
  config
}: Pick<AppComponents, 'fetch' | 'logs' | 'config'>): Promise<EntityManifestFetcherComponent> {
  const logger = logs.getLogger('entity-manifest-fetcher')
  const entityManifestUrl = await config.requireString('ASSET_BUNDLE_CDN_URL')

  async function downloadManifest(entityId: string, platform: string): Promise<Manifest | null> {
    try {
      const manifestName = platform !== 'webglb' ? `${entityId}_${platform}` : entityId
      const url = `${entityManifestUrl}manifest/${manifestName}.json`
      logger.debug('Attempting to download entity manifest', { entityId, platform, url })
      const response = await fetch.fetch(url)
      logger.debug('Response', { response: response.status })
      if (!response.ok) {
        logger.error('Failed to download entity manifest', { entityId, platform, status: response.status })
        return null
      }
      return response.json()
    } catch (error: any) {
      logger.error('Failed to download entity manifest', { entityId, platform, error: error?.message || 'unknown' })
      return null
    }
  }

  return { downloadManifest }
}
