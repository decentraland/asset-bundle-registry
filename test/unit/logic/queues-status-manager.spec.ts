import { createInMemoryCacheComponent } from "../../../src/adapters/memory-cache"
import { createQueuesStatusManagerComponent } from "../../../src/logic/queues-status-manager"
import { EntityQueueStatusValue } from "../../../src/types"

describe('queues status manager', () => {
    const memoryStorage = createInMemoryCacheComponent()
    const queuesStatusManager = createQueuesStatusManagerComponent({ memoryStorage })
    const entityId = 'baf1'
    const platform = 'windows'

    afterEach(() => {
        jest.clearAllMocks()
        memoryStorage.purge(`jobs:${platform}:${entityId}`)
        memoryStorage.purge(`jobs:mac:${entityId}`)
        memoryStorage.purge(`jobs:webgl:${entityId}`)
    })

    it('should return empty for pending entities when there are no pending entities', async () => {
        const result = await queuesStatusManager.getAllPendingEntities(platform)
        expect(result).toEqual([])
    })

    it('should mark entity as queued', async () => {
        jest.spyOn(memoryStorage, 'set')

        await queuesStatusManager.markAsQueued(platform, entityId)
        expect(memoryStorage.set).toHaveBeenCalledWith(`jobs:${platform}:${entityId}`, { entityId, platform, status: EntityQueueStatusValue.BUNDLE_PENDING })
    })

    it('should mark entity as pending and then purged when finished', async () => {
        jest.spyOn(memoryStorage, 'set')
        jest.spyOn(memoryStorage, 'purge')
        await queuesStatusManager.markAsQueued(platform, entityId)
        await queuesStatusManager.markAsFinished(platform, entityId)

        const result = await queuesStatusManager.getAllPendingEntities(platform)
        expect(result).toEqual([])
        expect(memoryStorage.set).toHaveBeenCalledWith(`jobs:${platform}:${entityId}`, { entityId, platform, status: EntityQueueStatusValue.BUNDLE_PENDING })
        expect(memoryStorage.purge).toHaveBeenCalledWith(`jobs:${platform}:${entityId}`)
    })

    it('should mark entity as bundled even when it was not marked as pending before', async () => {
        jest.spyOn(memoryStorage, 'set')
        await queuesStatusManager.markAsFinished(platform, entityId)
        expect(memoryStorage.set).toHaveBeenCalledWith(`jobs:${platform}:${entityId}`, { entityId, platform, status: EntityQueueStatusValue.BUNDLE_COMPLETE })
    })

    it('should mark entity as bundled and then as stale when disordered events arrived', async () => {
        jest.spyOn(memoryStorage, 'set')
        await queuesStatusManager.markAsFinished(platform, entityId)
        await queuesStatusManager.markAsQueued(platform, entityId)
        expect(memoryStorage.set).toHaveBeenCalledWith(`jobs:${platform}:${entityId}`, { entityId, platform, status: EntityQueueStatusValue.BUNDLE_COMPLETE })
        expect(memoryStorage.set).toHaveBeenCalledWith(`jobs:${platform}:${entityId}`, { entityId, platform, status: EntityQueueStatusValue.STALE })
    })

    describe('getAllPendingEntities', () => {
        it('should return pending entities', async () => {
            await queuesStatusManager.markAsQueued(platform, entityId)
            const result = await queuesStatusManager.getAllPendingEntities(platform)
            expect(result).toEqual([{ entityId, platform, status: EntityQueueStatusValue.BUNDLE_PENDING }])
        })

        it('should return pending entities for multiple platforms', async () => {
            await queuesStatusManager.markAsQueued(platform, entityId)
            await queuesStatusManager.markAsQueued('mac', entityId)
            await queuesStatusManager.markAsQueued('webgl', entityId)

            const windowsResult = await queuesStatusManager.getAllPendingEntities(platform)
            const macResult = await queuesStatusManager.getAllPendingEntities('mac')
            const webglResult = await queuesStatusManager.getAllPendingEntities('webgl')

            expect(windowsResult).toContainEqual({ entityId, platform: 'windows', status: EntityQueueStatusValue.BUNDLE_PENDING })
            expect(macResult).toContainEqual({ entityId, platform: 'mac', status: EntityQueueStatusValue.BUNDLE_PENDING })
            expect(webglResult).toContainEqual({ entityId, platform: 'webgl', status: EntityQueueStatusValue.BUNDLE_PENDING })
        })

        it('should not return stale entities', async () => {
            await queuesStatusManager.markAsQueued(platform, entityId)
            await queuesStatusManager.markAsFinished(platform, entityId)
            const result = await queuesStatusManager.getAllPendingEntities(platform)
            expect(result).toEqual([])
        })

        it('should not return already bundled entities', async () => {
            await queuesStatusManager.markAsFinished(platform, entityId)
            const result = await queuesStatusManager.getAllPendingEntities(platform)
            expect(result).toEqual([])
        })

        it('should return different entities for different platforms which were marked as pending', async () => {
            await queuesStatusManager.markAsQueued(platform, entityId)
            await queuesStatusManager.markAsQueued('mac', entityId)
            await queuesStatusManager.markAsQueued('mac', entityId + 'c')
            const windowsResult = await queuesStatusManager.getAllPendingEntities(platform)
            const macResult = await queuesStatusManager.getAllPendingEntities('mac')
            expect(windowsResult).toContainEqual({ entityId, platform, status: EntityQueueStatusValue.BUNDLE_PENDING })
            expect(macResult).toContainEqual({ entityId, platform: 'mac', status: EntityQueueStatusValue.BUNDLE_PENDING })
            expect(macResult).toContainEqual({ entityId: entityId + 'c', platform: 'mac', status: EntityQueueStatusValue.BUNDLE_PENDING })
        })
    })
})
