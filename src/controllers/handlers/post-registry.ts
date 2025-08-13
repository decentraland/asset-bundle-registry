import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, Registry } from '../../types'
import { Entity } from '@dcl/schemas'

export async function createRegistryHandler(
  context: HandlerContextWithPath<'registryOrchestrator' | 'catalyst' | 'entityStatusFetcher' | 'logs', '/registry'> &
    DecentralandSignatureContext<any>
) {
  const {
    components: { registryOrchestrator, catalyst, entityStatusFetcher, logs }
  } = context
  const logger = logs.getLogger('post-registry-handler')
  const body = await context.request.json()
  const uniqueEntityIds: Set<string> = new Set(body.entityIds || [])

  if (uniqueEntityIds.size === 0) {
    return {
      status: 400,
      body: {
        ok: false,
        message: 'No entity ids provided'
      }
    }
  }

  const response = {
    failures: [] as any[],
    successes: [] as any[]
  }

  for (const entityId of uniqueEntityIds) {
    try {
      const entityFromCatalyst: Entity | null = await catalyst.getEntityById(entityId)

      if (!entityFromCatalyst) {
        logger.warn('Entity not found in catalyst', { entityId })
        response.failures.push({
          entityId,
          error: 'Entity not found in catalyst'
        })
        continue
      }

      const [macAssets, windowsAssets, webglAssets] = await Promise.all(
        ['mac', 'windows', 'webgl'].map((platform) => entityStatusFetcher.fetchBundleManifestData(entityId, platform))
      )
      const [macLodsStatus, windowsLodsStatus, webglLodsStatus] = await Promise.all(
        ['mac', 'windows', 'webgl'].map((platform) => entityStatusFetcher.fetchLODsStatus(entityId, platform))
      )

      const { status: macAssetsStatus, version: macAssetsVersion, buildDate: macAssetsBuildDate } = macAssets
      const {
        status: windowsAssetsStatus,
        version: windowsAssetsVersion,
        buildDate: windowsAssetsBuildDate
      } = windowsAssets
      const { status: webglAssetsStatus, version: webglAssetsVersion, buildDate: webglAssetsBuildDate } = webglAssets

      const bundles: Registry.Bundles = {
        assets: {
          mac: macAssetsStatus,
          windows: windowsAssetsStatus,
          webgl: webglAssetsStatus
        },
        lods: {
          mac: macLodsStatus,
          windows: windowsLodsStatus,
          webgl: webglLodsStatus
        }
      }

      const versions: Registry.Versions = {
        assets: {
          windows: { version: windowsAssetsVersion, buildDate: windowsAssetsBuildDate },
          mac: { version: macAssetsVersion, buildDate: macAssetsBuildDate },
          webgl: { version: webglAssetsVersion, buildDate: webglAssetsBuildDate }
        }
      }

      await registryOrchestrator.persistAndRotateStates({
        ...entityFromCatalyst,
        deployer: '', // filled manually so we cannot calculate owner address, won't be overwritten on db if already exists
        bundles,
        versions
      })
    } catch (error: any) {
      logger.error('Error persisting entity', { error, entityId })
      response.failures.push({
        entityId,
        error: error.message
      })
    }
  }

  return {
    status: 200,
    body: JSON.stringify(response)
  }
}
