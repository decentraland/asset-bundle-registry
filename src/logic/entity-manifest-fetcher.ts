import { AppComponents, EntityManifestFetcherComponent, Manifest } from '../types'

export async function createEntityManifestFetcherComponent({
  fetch,
  logs,
  config
}: Pick<AppComponents, 'fetch' | 'logs' | 'config'>): Promise<EntityManifestFetcherComponent> {
  const logger = logs.getLogger('entity-manifest-fetcher')
  const entityManifestUrl = config.requireString('ASSET_BUNDLE_CDN_URL')

  async function downloadManifest(entityId: string, platform: string): Promise<Manifest | null> {
    try {
      const response = await fetch.fetch(`${entityManifestUrl}/manifest/${entityId}_${platform}.json`)
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
