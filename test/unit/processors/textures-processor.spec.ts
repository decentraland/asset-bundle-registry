import { createTexturesProcessor } from "../../../src/logic/processors/textures-processor"
import { ManifestStatusCode, Registry } from "../../../src/types"
import { createDbMockComponent } from "../mocks/db"
import { createLogMockComponent } from "../mocks/logs"

describe('textures-processor should', () => {
    const mockTexturesEvent = {
        metadata: {
            entityId: '123',
            platform: 'webglb'
        }
    }
    const dbMock = createDbMockComponent()
    const logsMock = createLogMockComponent()
    const entityManifestFetcherMock = {
        downloadManifest: jest.fn()
    }

    const sut = createTexturesProcessor({ logs: logsMock, db: dbMock, entityManifestFetcher: entityManifestFetcherMock })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('return an error when the entity is not found in the database', async () => {
        dbMock.getRegistryById = jest.fn().mockResolvedValue(null)

        const result = await sut.process(mockTexturesEvent)

        expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
        expect(result).toEqual({ ok: false, errors: ['Entity not found in the database'] })
    })

    it('return an error when the entity manifest is not found', async () => {
        dbMock.getRegistryById = jest.fn().mockResolvedValue({ id: mockTexturesEvent.metadata.entityId })
        entityManifestFetcherMock
            .downloadManifest
            .mockResolvedValue(null)

        const result = await sut.process(mockTexturesEvent)

        expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
        expect(entityManifestFetcherMock.downloadManifest).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId, mockTexturesEvent.metadata.platform)
        expect(result).toEqual({ ok: false, errors: ['Error storing bundle'] })
    })

    it('process successfully when entity and manifest are found', async () => {
        dbMock.getRegistryById = jest.fn().mockResolvedValue({ id: mockTexturesEvent.metadata.entityId, timestamp: 123, metadata: { pointers: ['0,0'] }})
        entityManifestFetcherMock.downloadManifest.mockResolvedValue({
            exitCode: ManifestStatusCode.SUCCESS
        })
        dbMock.upsertRegistryBundle = jest.fn().mockResolvedValue({ status: Registry.StatusValues.OPTMIZED })
    
        const result = await sut.process(mockTexturesEvent)
    
        expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
        expect(entityManifestFetcherMock.downloadManifest).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId, mockTexturesEvent.metadata.platform)
        expect(dbMock.upsertRegistryBundle).toHaveBeenCalledWith(
            mockTexturesEvent.metadata.entityId,
            mockTexturesEvent.metadata.platform,
            Registry.StatusValues.OPTMIZED
        )
        expect(result).toEqual({ ok: true })
    })

    it('mark entity as error when manifest is not successful', async () => {
        dbMock.getRegistryById = jest.fn().mockResolvedValue({ id: mockTexturesEvent.metadata.entityId, timestamp: 123, metadata: { pointers: ['0,0'] }})
        entityManifestFetcherMock
            .downloadManifest
            .mockResolvedValue({ exitCode: ManifestStatusCode.EMBED_MATERIAL_FAILURE })

        dbMock.upsertRegistryBundle = jest.fn().mockResolvedValue({ status: Registry.StatusValues.ERROR })
        
        const result = await sut.process(mockTexturesEvent)

        expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
        expect(entityManifestFetcherMock.downloadManifest).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId, mockTexturesEvent.metadata.platform)
        expect(dbMock.upsertRegistryBundle).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId, mockTexturesEvent.metadata.platform, Registry.StatusValues.ERROR)
        expect(result).toEqual({ ok: true })
    })
})