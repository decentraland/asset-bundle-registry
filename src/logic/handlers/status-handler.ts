import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { AppComponents, EventHandlerComponent, EventHandlerName, EventHandlerResult } from '../../types'
import { AssetBundleConversionManuallyQueuedEvent, Events } from '@dcl/schemas'

export const createStatusEventHandler = ({
  logs,
  queuesStatusManager
}: Pick<AppComponents, 'logs' | 'queuesStatusManager'>): EventHandlerComponent<
  DeploymentToSqs | AssetBundleConversionManuallyQueuedEvent
> => {
  const HANDLER_NAME = EventHandlerName.STATUS
  const logger = logs.getLogger('status-handler')

  function getEventProperties(event: any) {
    let entityId: string = ''
    let isLods: boolean = false
    const platforms: ('webgl' | 'windows' | 'mac')[] = []

    if (event.type === Events.Type.ASSET_BUNDLE && event.subType === Events.SubType.AssetBundle.MANUALLY_QUEUED) {
      const { metadata } = event as AssetBundleConversionManuallyQueuedEvent

      entityId = metadata.entityId
      platforms.push(metadata.platform)
      isLods = metadata.isLods
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
    handle: async (event: DeploymentToSqs | AssetBundleConversionManuallyQueuedEvent): Promise<EventHandlerResult> => {
      try {
        const { entityId, platforms, isLods } = getEventProperties(event)

        if (isLods) {
          logger.info('Skipping processing status for LODs', { entityId, platforms: platforms.join(', ') })
          return { ok: true, handlerName: HANDLER_NAME }
        }

        logger.info('Processing status', { entityId, platforms: platforms.join(', ') })

        for (const platform of platforms) {
          await queuesStatusManager.markAsQueued(platform, entityId)
        }

        return { ok: true, handlerName: HANDLER_NAME }
      } catch (error: any) {
        logger.error('Failed to process', {
          error: error?.message || 'Unexpected processor failure',
          stack: JSON.stringify(error?.stack)
        })

        return { ok: false, errors: [error?.message || 'Unexpected processor failure'], handlerName: HANDLER_NAME }
      }
    },
    canHandle: (event: any): boolean => {
      DeploymentToSqs.validate(event)
      AssetBundleConversionManuallyQueuedEvent.validate(event)

      return !DeploymentToSqs.validate.errors || !AssetBundleConversionManuallyQueuedEvent.validate.errors
    },
    name: HANDLER_NAME
  }
}
