import { AssetBundleConversionManuallyQueuedEvent, Events } from '@dcl/schemas'
import { createInMemoryCacheComponent } from '../../../../src/adapters/memory-cache'
import { createStatusEventHandler } from '../../../../src/logic/handlers/status-handler'
import { createQueuesStatusManagerComponent } from '../../../../src/logic/queues-status-manager'
import { createLogMockComponent } from '../../mocks/logs'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { AuthLinkType } from '@dcl/crypto'

describe('status processor', () => {
  const logs = createLogMockComponent()
  const memoryStorage = createInMemoryCacheComponent()
  const queuesStatusManager = createQueuesStatusManagerComponent({ memoryStorage })
  const statusProcessor = createStatusEventHandler({ logs, queuesStatusManager })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should be able to handle deployment event', () => {
    const event = createDeploymentEvent('baf1')
    const result = statusProcessor.canHandle(event)
    expect(result).toBe(true)
  })

  it('should be able to handle asset bundle conversion manually queued event', () => {
    const event = createAssetBundleConversionManuallyQueuedEvent('baf1', 'windows')
    const result = statusProcessor.canHandle(event)
    expect(result).toBe(true)
  })

  it('should handle deployment event and mark all platforms as pending', async () => {
    jest.spyOn(queuesStatusManager, 'markAsQueued')
    jest.spyOn(queuesStatusManager, 'markAsManuallyQueued')
    const event = createDeploymentEvent('baf1')
    const result = await statusProcessor.handle(event)
    expect(result.ok).toBe(true)
    expect(queuesStatusManager.markAsQueued).toHaveBeenCalledTimes(3)
    expect(queuesStatusManager.markAsManuallyQueued).not.toHaveBeenCalled()
  })

  it('should handle asset bundle conversion manually queued event and mark the specific platform as pending and manually queued', async () => {
    jest.spyOn(queuesStatusManager, 'markAsQueued')
    jest.spyOn(queuesStatusManager, 'markAsManuallyQueued')
    const event = createAssetBundleConversionManuallyQueuedEvent('baf1', 'windows')
    const result = await statusProcessor.handle(event)
    expect(result.ok).toBe(true)
    expect(queuesStatusManager.markAsQueued).toHaveBeenCalledTimes(1)
    expect(queuesStatusManager.markAsQueued).toHaveBeenCalledWith('windows', 'baf1')
    expect(queuesStatusManager.markAsManuallyQueued).toHaveBeenCalledTimes(1)
    expect(queuesStatusManager.markAsManuallyQueued).toHaveBeenCalledWith('windows', 'baf1')
  })

  it('should not set any marker when the manually queued event is for LODs', async () => {
    jest.spyOn(queuesStatusManager, 'markAsQueued')
    jest.spyOn(queuesStatusManager, 'markAsManuallyQueued')
    const event = createAssetBundleConversionManuallyQueuedEvent('baf1', 'windows', true)
    const result = await statusProcessor.handle(event)
    expect(result.ok).toBe(true)
    expect(queuesStatusManager.markAsQueued).not.toHaveBeenCalled()
    expect(queuesStatusManager.markAsManuallyQueued).not.toHaveBeenCalled()
  })
})

function createDeploymentEvent(entityId: string): DeploymentToSqs {
  return {
    entity: {
      entityId,
      authChain: [
        {
          type: AuthLinkType.SIGNER,
          payload: 'payload',
          signature: ''
        }
      ]
    }
  }
}

function createAssetBundleConversionManuallyQueuedEvent(
  entityId: string,
  platform: 'windows' | 'mac' | 'webgl',
  isLods: boolean = false
): AssetBundleConversionManuallyQueuedEvent {
  return {
    type: Events.Type.ASSET_BUNDLE,
    subType: Events.SubType.AssetBundle.MANUALLY_QUEUED,
    key: 'key',
    timestamp: Date.now(),
    metadata: {
      entityId,
      platform,
      isLods,
      isPriority: false,
      version: 'v1'
    }
  }
}
