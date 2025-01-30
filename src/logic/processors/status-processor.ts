import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { AppComponents, EventHandlerComponent, ProcessorResult } from '../../types'
import { AssetBundleConversionManuallyQueuedEvent, Events } from '@dcl/schemas'

export const createStatusProcessor = ({
  logs,
  queuesStatusManager
}: Pick<AppComponents, 'logs' | 'queuesStatusManager'>): EventHandlerComponent => {
  const logger = logs.getLogger('status-processor')

  function getEventProperties(event: any) {
    let entityId: string = ''
    let isLods: boolean = false
    const platforms: ('webgl' | 'windows' | 'mac')[] = []

    if (event.type === Events.Type.ASSET_BUNDLE && event.subType === Events.SubType.AssetBundle.MANUALLY_QUEUED) {
      const manuallyQueuedEvent = event as AssetBundleConversionManuallyQueuedEvent

      entityId = manuallyQueuedEvent.metadata.entityId
      platforms.push(manuallyQueuedEvent.metadata.platform)
      isLods = manuallyQueuedEvent.metadata.isLods
    } else {
      const deploymentEvent = event as DeploymentToSqs

      entityId = deploymentEvent.entity.entityId
      platforms.push('webgl')
      platforms.push('windows')
      platforms.push('mac')
    }

    return {
      entityId,
      platforms,
      isLods
    }
  }

  return {
    process: async (event: any): Promise<ProcessorResult> => {
      try {
        const { entityId, platforms, isLods } = getEventProperties(event)

        if (isLods) {
          logger.info('Skipping processing status for LODs', { entityId, platforms: platforms.join(', ') })
          return { ok: true }
        }

        logger.info('Processing status', { entityId, platforms: platforms.join(', ') })

        for (const platform of platforms) {
          await queuesStatusManager.markAsQueued(platform, entityId)
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
