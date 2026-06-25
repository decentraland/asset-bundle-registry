import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import {
  AppComponents,
  IEventHandlerComponent,
  EventHandlerName,
  EventHandlerResult,
  isSupportedPlatform,
  SupportedPlatform
} from '../../types'
import { AssetBundleConversionManuallyQueuedEvent, Events } from '@dcl/schemas'

export const createStatusEventHandler = ({
  logs,
  queuesStatusManager
}: Pick<AppComponents, 'logs' | 'queuesStatusManager'>): IEventHandlerComponent<
  DeploymentToSqs | AssetBundleConversionManuallyQueuedEvent
> => {
  const HANDLER_NAME = EventHandlerName.STATUS
  const logger = logs.getLogger('status-handler')

  function getEventProperties(event: any) {
    let entityId: string = ''
    let isLods: boolean = false
    const platforms: SupportedPlatform[] = []

    if (event.type === Events.Type.ASSET_BUNDLE && event.subType === Events.SubType.AssetBundle.MANUALLY_QUEUED) {
      const { metadata } = event as AssetBundleConversionManuallyQueuedEvent

      if (!isSupportedPlatform(metadata.platform)) {
        return { entityId: '', platforms: [], isLods: false }
      }

      entityId = metadata.entityId
      platforms.push(metadata.platform)
      isLods = metadata.isLods
    } else {
      const deploymentEvent = event as DeploymentToSqs

      entityId = deploymentEvent.entity.entityId
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

        if (platforms.length === 0) {
          logger.warn('Ignoring event for unsupported platform')
          return { ok: true, handlerName: HANDLER_NAME }
        }

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
