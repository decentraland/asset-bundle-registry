import { AppComponents, EntityStatusFetcher, Registry } from '../types'
import { withRetry } from '../utils/timer'

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
  const MAX_RETRIES = (await config.getNumber('MAX_RETRIES')) || 5
  const logger = logs.getLogger('entity-status-fetcher')
  const LEVEL_OF_DETAILS = ['0', '1', '2']

  async function fetchBundleStatus(entityId: string, platform: string): Promise<Registry.SimplifiedStatus> {
    return withRetry(
      async (isLastAttempt: boolean) => {
        const manifestName = platform !== 'webgl' ? `${entityId}_${platform}` : entityId
        const manifestUrl = `${ASSET_BUNDLE_CDN_URL}manifest/${manifestName}.json?byPassCache=${isLastAttempt}`

        const response = await fetch.fetch(manifestUrl)

        if (!response.ok) {
          if (response.status === 404 && isLastAttempt) {
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
      },
      { maxRetries: MAX_RETRIES, baseDelay: 5000, logger }
    )
  }

  async function fetchLODsStatus(entityId: string, platform: string): Promise<Registry.SimplifiedStatus> {
    return withRetry(
      async () => {
        const lodsBaseUrl = `${ASSET_BUNDLE_CDN_URL}LOD`
        const urlPlatformSuffix = platform === 'webgl' ? '' : `_${platform}`
        const allUrls = LEVEL_OF_DETAILS.map(
          (levelOfDetail: string) => `${lodsBaseUrl}/${levelOfDetail}/${entityId}_${levelOfDetail}${urlPlatformSuffix}`
        )

        const allResponses = await Promise.all(allUrls.map((url) => fetch.fetch(url, { method: 'HEAD' })))
        const allExist = allResponses.every((response) => response.ok)
        return allExist ? Registry.SimplifiedStatus.COMPLETE : Registry.SimplifiedStatus.FAILED
      },
      { maxRetries: MAX_RETRIES, baseDelay: 5000, logger }
    )
  }

  return {
    fetchBundleStatus,
    fetchLODsStatus
  }
}
