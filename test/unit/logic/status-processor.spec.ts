import { AssetBundleConversionManuallyQueuedEvent, Events } from "@dcl/schemas"
import { createInMemoryCacheComponent } from "../../../src/adapters/memory-cache"
import { createStatusProcessor } from "../../../src/logic/processors/status-processor"
import { createQueuesStatusManagerComponent } from "../../../src/logic/queues-status-manager"
import { createLogMockComponent } from "../mocks/logs"
import { DeploymentToSqs } from "@dcl/schemas/dist/misc/deployments-to-sqs"
import { AuthLinkType } from "@dcl/crypto"

describe('status processor', () => {
    const logs = createLogMockComponent()
    const memoryStorage = createInMemoryCacheComponent()
    const queuesStatusManager = createQueuesStatusManagerComponent({ memoryStorage })
    const statusProcessor = createStatusProcessor({ logs, queuesStatusManager })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should be able to handle deployment event', () => {
        const event = createDeploymentEvent('baf1')
        const result = statusProcessor.canProcess(event)
        expect(result).toBe(true)
    })

    it('should be able to handle asset bundle conversion manually queued event', () => {
        const event = createAssetBundleConversionManuallyQueuedEvent('baf1', 'windows')
        const result = statusProcessor.canProcess(event)
        expect(result).toBe(true)
    })

    it('should handle deployment event and mark all platforms as pending', async () => {
        jest.spyOn(queuesStatusManager, 'markAsQueued')
        const event = createDeploymentEvent('baf1')
        const result = await statusProcessor.process(event)
        expect(result.ok).toBe(true)
        expect(queuesStatusManager.markAsQueued).toHaveBeenCalledTimes(3)
    })

    it('should handle asset bundle conversion manually queued event and mark the specific platform as pending', async () => {
        jest.spyOn(queuesStatusManager, 'markAsQueued')
        const event = createAssetBundleConversionManuallyQueuedEvent('baf1', 'windows')
        const result = await statusProcessor.process(event)
        expect(result.ok).toBe(true)
        expect(queuesStatusManager.markAsQueued).toHaveBeenCalledTimes(1)
        expect(queuesStatusManager.markAsQueued).toHaveBeenCalledWith('windows', 'baf1')
    })
})

function createDeploymentEvent(entityId: string): DeploymentToSqs {
    return {
        entity: {
            entityId,
            authChain: [{
                type: AuthLinkType.SIGNER,
                payload: 'payload',
                signature: ''
            }]
        }
    }
}

function createAssetBundleConversionManuallyQueuedEvent(entityId: string, platform: 'windows' | 'mac' | 'webgl'): AssetBundleConversionManuallyQueuedEvent {
    return {
        type: Events.Type.ASSET_BUNDLE,
        subType: Events.SubType.AssetBundle.MANUALLY_QUEUED,
        key: 'key',
        timestamp: Date.now(),
        metadata: {
            entityId,
            platform,
            isLods: false,
            isPriority: false
        }
    }
}
