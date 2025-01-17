import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { AppComponents, EventHandlerComponent, ProcessorResult } from '../../types'
import { AssetBundleConversionManuallyQueuedEvent, Events } from '@dcl/schemas'
import { generateCacheKey } from '../../utils/key-generator'

export const createStatusProcessor = async ({
  logs,
  memoryStorage
}: Pick<AppComponents, 'logs' | 'config' | 'fetch' | 'memoryStorage'>): Promise<EventHandlerComponent> => {
  const logger = logs.getLogger('status-processor')

  function getEventProperties(event: any) {
    let entityId: string = ''
    let isPriority: boolean = false
    let isLods: boolean = false
    let platform: 'webgl' | 'windows' | 'mac' | 'all' = 'all'

    if (event.type === Events.Type.ASSET_BUNDLE && event.subType === Events.SubType.AssetBundle.MANUALLY_QUEUED) {
      const manuallyQueuedEvent = event as AssetBundleConversionManuallyQueuedEvent

      entityId = manuallyQueuedEvent.metadata.entityId
      isPriority = manuallyQueuedEvent.metadata.isPriority
      platform = manuallyQueuedEvent.metadata.platform
      isLods = manuallyQueuedEvent.metadata.isLods
    } else {
      const deploymentEvent = event as DeploymentToSqs

      entityId = deploymentEvent.entity.entityId
    }

    return {
      entityId,
      isPriority,
      platform,
      isLods
    }
  }

  return {
    process: async (event: any): Promise<ProcessorResult> => {
      try {
        const keys: string[] = []

        const { entityId, platform, isLods } = getEventProperties(event)

        if (isLods) {
          logger.info('Skipping processing status for LODs', { entityId, platform })
          return { ok: true }
        }

        logger.info('Processing status', { entityId, platform })

        if (platform === 'all') {
          ;['windows', 'mac', 'webgl'].forEach((platform: any) => {
            keys.push(generateCacheKey(platform, entityId))
          })
        } else {
          keys.push(generateCacheKey(platform, entityId))
        }

        for (const key of keys) {
          await memoryStorage.set(`${key}`, Date.now())
        }

        return { ok: true }
      } catch (error: any) {
        logger.error('Failed to process', {
          error: error?.message || 'Unexpected processor failure',
          stack: JSON.stringify(error?.stack)
        })

        return { ok: false, errors: [error?.message || 'Unexpected processor failure'] }
      }
    },
    canProcess: (event: any): boolean => {
      DeploymentToSqs.validate(event)
      AssetBundleConversionManuallyQueuedEvent.validate(event)

      return !DeploymentToSqs.validate.errors || !AssetBundleConversionManuallyQueuedEvent.validate.errors
    },
    name: 'Status Processor'
  }
}
