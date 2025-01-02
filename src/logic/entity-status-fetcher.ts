import { AppComponents, EntityStatusFetcher, Registry } from '../types'

export enum ManifestStatusCode {
  SUCCESS = 0,
  UNDEFINED = 1,
  SCENE_LIST_NULL = 2,
  ASSET_BUNDLE_BUILD_FAIL = 3,
  VISUAL_TEST_FAILED = 4,
  UNEXPECTED_ERROR = 5,
  GLTFAST_CRITICAL_ERROR = 6,
  GLTF_IMPORTER_NOT_FOUND = 7,
  EMBED_MATERIAL_FAILURE = 8,
  DOWNLOAD_FAILED = 9,
  INVALID_PLATFORM = 10,
  GLTF_PROCESS_MISMATCH = 11,
  CONVERSION_ERRORS_TOLERATED = 12,
  ALREADY_CONVERTED = 13
}

type Manifest = {
  version: string
  files: string[]
  exitCode: ManifestStatusCode
  contentServerUrl: string
  date: string
}

export async function createEntityStatusFetcherComponent({
  fetch,
  logs,
  config
}: Pick<AppComponents, 'fetch' | 'logs' | 'config'>): Promise<EntityStatusFetcher> {
  const ASSET_BUNDLE_CDN_URL = (await config.requireString('ASSET_BUNDLE_CDN_URL')).replace(/\/?$/, '/')
  const logger = logs.getLogger('entity-status-fetcher')

  async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error: any) {
        const isLastAttempt = attempt === maxRetries - 1
        if (isLastAttempt) throw error

        const delay = baseDelay * Math.pow(2, attempt)
        logger.warn('Operation failed, retrying...', {
          attempt: attempt + 1,
          delay,
          error: error?.message || 'unknown'
        })
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
    throw new Error('Should never reach this point')
  }

  async function fetchBundleStatus(entityId: string, platform: string): Promise<Registry.SimplifiedStatus> {
    return withRetry(async () => {
      const manifestName = platform !== 'webgl' ? `${entityId}_${platform}` : entityId
      const manifestUrl = `${ASSET_BUNDLE_CDN_URL}manifest/${manifestName}.json`

      const response = await fetch.fetch(manifestUrl)

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn('Manifest not found', { entityId, platform, manifestUrl })
          return Registry.SimplifiedStatus.PENDING
        } else {
          logger.error('Failed to fetch bundle status', {
            entityId,
            platform,
            status: response.status,
            manifestUrl
          })

          throw new Error('Failed to fetch bundle status')
        }
      }

      const parsedManifest: Manifest = await response.json()

      if (
        parsedManifest.exitCode === ManifestStatusCode.SUCCESS ||
        parsedManifest.exitCode === ManifestStatusCode.CONVERSION_ERRORS_TOLERATED ||
        parsedManifest.exitCode === ManifestStatusCode.ALREADY_CONVERTED
      ) {
        return Registry.SimplifiedStatus.COMPLETE
      } else {
        return Registry.SimplifiedStatus.FAILED
      }
    })
  }

  async function fetchLODsStatus(entityId: string, platform: string): Promise<Registry.SimplifiedStatus> {
    return withRetry(async () => {
      const lodsBaseUrl = `${ASSET_BUNDLE_CDN_URL}LOD`
      const urlPlatformSuffix = platform === 'webgl' ? '' : `_${platform}`
      const allUrls = ['0', '1', '2'].map(
        (levelOfDetail: string) => `${lodsBaseUrl}/${levelOfDetail}/${entityId}_${levelOfDetail}${urlPlatformSuffix}`
      )

      const allResponses = await Promise.all(allUrls.map((url) => fetch.fetch(url, { method: 'HEAD' })))
      const allExist = allResponses.every((response) => response.ok)
      return allExist ? Registry.SimplifiedStatus.COMPLETE : Registry.SimplifiedStatus.FAILED
    })
  }

  return {
    fetchBundleStatus,
    fetchLODsStatus
  }
}
