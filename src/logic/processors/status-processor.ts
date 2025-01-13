import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { AppComponents, EventHandlerComponent, ProcessorResult } from '../../types'
import { AssetBundleConversionManuallyQueuedEvent, Events } from '@dcl/schemas'

type AssetBundleAdminStatusResponse = {
  commitHash: string
  queueStatus: {
    'ab-conversion-queue-windows': number
    'ab-conversion-priority-queue-windows': number
    'ab-conversion-queue-mac': number
    'ab-conversion-priority-queue-mac': number
    'ab-conversion-queue': number
    'ab-conversion-priority-queue': number
  }
}

export const createStatusProcessor = async ({
  logs,
  config,
  fetch,
  memoryStorage
}: Pick<AppComponents, 'logs' | 'config' | 'fetch' | 'memoryStorage'>): Promise<EventHandlerComponent> => {
  const logger = logs.getLogger('status-processor')
  const assetBundleAdminUrl = await config.requireString('ASSET_BUNDLE_ADMIN_URL')

  async function getAmountOfMessagesInABQueues() {
    const response = await fetch.fetch(assetBundleAdminUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const parsedResponse: AssetBundleAdminStatusResponse = await response.json()

    return {
      windows: parsedResponse.queueStatus['ab-conversion-queue-windows'],
      windowsPriority: parsedResponse.queueStatus['ab-conversion-priority-queue-windows'],
      mac: parsedResponse.queueStatus['ab-conversion-queue-mac'],
      macPriority: parsedResponse.queueStatus['ab-conversion-priority-queue-mac'],
      webgl: parsedResponse.queueStatus['ab-conversion-queue'],
      webglPriority: parsedResponse.queueStatus['ab-conversion-priority-queue']
    }
  }

  function getEventProperties(event: any) {
    let entityId: string = ''
    let isPriority: boolean = false
    let platform: 'webgl' | 'windows' | 'mac' | 'all' = 'all'

    if (event.type === Events.Type.ASSET_BUNDLE && event.subType === Events.SubType.AssetBundle.MANUALLY_QUEUED) {
      const manuallyQueuedEvent = event as AssetBundleConversionManuallyQueuedEvent

      entityId = manuallyQueuedEvent.metadata.entityId
      isPriority = manuallyQueuedEvent.metadata.isPriority
      platform = manuallyQueuedEvent.metadata.platform
    } else {
      const deploymentEvent = event as DeploymentToSqs

      entityId = deploymentEvent.entity.entityId
    }

    return {
      entityId,
      isPriority,
      platform
    }
  }

  return {
    process: async (event: any): Promise<ProcessorResult> => {
      const amountOfMessages: {
        windows: number
        windowsPriority: number
        mac: number
        macPriority: number
        webgl: number
        webglPriority: number
      } = await getAmountOfMessagesInABQueues()

      const { entityId, isPriority, platform } = getEventProperties(event)

      const statusToCache = (await memoryStorage.get(entityId)) || {
        windowsPendingJobs: undefined,
        windowsPriorityPendingJobs: undefined,
        macPendingJobs: undefined,
        macPriorityPendingJobs: undefined,
        webPendingJobs: undefined,
        webPriorityPendingJobs: undefined
      }

      if (platform !== 'all') {
        statusToCache[`${platform}PendingJobs`] = isPriority
          ? amountOfMessages[`${platform}Priority`]
          : amountOfMessages[platform]
      } else {
        const prefix = isPriority ? 'Priority' : ''
        statusToCache[`windows${prefix}PendingJobs`] = amountOfMessages[`windows${prefix}`]
        statusToCache[`mac${prefix}PendingJobs`] = amountOfMessages[`mac${prefix}`]
        statusToCache[`web${prefix}PendingJobs`] = amountOfMessages[`webgl${prefix}`]
      }

      statusToCache.when = Date.now()
      await memoryStorage.set(entityId, statusToCache)
      logger.debug('Status cached', { entityId, statusToCache })

      return { ok: true }
    },
    canProcess: (event: any): boolean => {
      DeploymentToSqs.validate(event)
      AssetBundleConversionManuallyQueuedEvent.validate(event)

      return (
        !DeploymentToSqs.validate.errors?.length && !AssetBundleConversionManuallyQueuedEvent.validate.errors?.length
      )
    },
    name: 'Status Processor'
  }
}
