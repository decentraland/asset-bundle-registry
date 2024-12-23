import { createTexturesProcessor } from "../../../src/logic/processors/textures-processor"
import { Registry } from "../../../src/types"
import { createDbMockComponent } from "../mocks/db"
import { createLogMockComponent } from "../mocks/logs"

describe('textures-processor should', () => {
    const mockTexturesEvent = {
        metadata: {
            entityId: '123',
            platform: 'webgl'
        }
    }
    const dbMock = createDbMockComponent()
    const logsMock = createLogMockComponent()
    const entityStatusFetcherMock = {
        fetchBundleStatus: jest.fn(),
        fetchLODsStatus: jest.fn()
    }
    const registryOrchestratorMock = {
        persistAndRotateStates: jest.fn()
    }

    const sut = createTexturesProcessor({ logs: logsMock, db: dbMock, entityStatusFetcher: entityStatusFetcherMock, registryOrchestrator: registryOrchestratorMock })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('return an error when the entity is not found in the database', async () => {
        dbMock.getRegistryById = jest.fn().mockResolvedValue(null)

        const result = await sut.process(mockTexturesEvent)

        expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
        expect(result).toEqual({ ok: false, errors: ['Entity not found in the database'] })
    })

    it('return an error when bundle storage fails', async () => {
        dbMock.getRegistryById = jest.fn().mockResolvedValue({ id: mockTexturesEvent.metadata.entityId })
        entityStatusFetcherMock.fetchBundleStatus.mockResolvedValue(Registry.Status.COMPLETE)
        dbMock.upsertRegistryBundle = jest.fn().mockResolvedValue(null)

        const result = await sut.process(mockTexturesEvent)

        expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
        expect(entityStatusFetcherMock.fetchBundleStatus).toHaveBeenCalledWith(
            mockTexturesEvent.metadata.entityId,
            mockTexturesEvent.metadata.platform
        )
        expect(result).toEqual({ ok: false, errors: ['Error storing bundle'] })
    })

    it('process successfully when entity is found and bundle is stored', async () => {
        dbMock.getRegistryById = jest.fn().mockResolvedValue({ 
            id: mockTexturesEvent.metadata.entityId, 
            timestamp: 123, 
            metadata: { pointers: ['0,0'] }
        })
        entityStatusFetcherMock.fetchBundleStatus.mockResolvedValue(Registry.Status.COMPLETE)
        dbMock.upsertRegistryBundle = jest.fn().mockResolvedValue({ 
            id: mockTexturesEvent.metadata.entityId,
            status: Registry.Status.COMPLETE,
            bundles: {}
        })
        
        const result = await sut.process(mockTexturesEvent)
    
        expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
        expect(entityStatusFetcherMock.fetchBundleStatus).toHaveBeenCalledWith(
            mockTexturesEvent.metadata.entityId,
            mockTexturesEvent.metadata.platform
        )
        expect(dbMock.upsertRegistryBundle).toHaveBeenCalledWith(
            mockTexturesEvent.metadata.entityId,
            mockTexturesEvent.metadata.platform,
            false,
            Registry.Status.COMPLETE
        )
        expect(registryOrchestratorMock.persistAndRotateStates).toHaveBeenCalled()
        expect(result).toEqual({ ok: true })
    })

    it('process with error status when bundle status is error', async () => {
        dbMock.getRegistryById = jest.fn().mockResolvedValue({ 
            id: mockTexturesEvent.metadata.entityId, 
            timestamp: 123, 
            metadata: { pointers: ['0,0'] }
        })
        entityStatusFetcherMock.fetchBundleStatus.mockResolvedValue(Registry.SimplifiedStatus.FAILED)
        dbMock.upsertRegistryBundle = jest.fn().mockResolvedValue({ 
            id: mockTexturesEvent.metadata.entityId,
            status: Registry.SimplifiedStatus.FAILED,
            bundles: {}
        })
        
        const result = await sut.process(mockTexturesEvent)

        expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
        expect(entityStatusFetcherMock.fetchBundleStatus).toHaveBeenCalledWith(
            mockTexturesEvent.metadata.entityId,
            mockTexturesEvent.metadata.platform
        )
        expect(dbMock.upsertRegistryBundle).toHaveBeenCalledWith(
            mockTexturesEvent.metadata.entityId,
            mockTexturesEvent.metadata.platform,
            false,
            Registry.SimplifiedStatus.FAILED
        )
        expect(registryOrchestratorMock.persistAndRotateStates).toHaveBeenCalled()
        expect(result).toEqual({ ok: true })
    })
})