import { createInMemoryCacheComponent } from '../../../src/adapters/memory-cache'
import { createTexturesProcessor } from '../../../src/logic/processors/textures-processor'
import { createQueuesStatusManagerComponent } from '../../../src/logic/queues-status-manager'
import { Registry } from '../../../src/types'
import { createCatalystMockComponent } from '../mocks/catalyst'
import { createDbMockComponent } from '../mocks/db'
import { createLogMockComponent } from '../mocks/logs'
import { createWorldsMockComponent } from '../mocks/worlds'

describe('textures-processor should', () => {
  const mockTexturesEvent = {
    metadata: {
      entityId: '123',
      platform: 'webgl'
    }
  }
  const dbMock = createDbMockComponent()
  const logsMock = createLogMockComponent()
  const catalystMock = createCatalystMockComponent()
  const worldsMock = createWorldsMockComponent()
  const entityStatusFetcherMock = {
    fetchBundleStatus: jest.fn(),
    fetchLODsStatus: jest.fn()
  }
  const registryOrchestratorMock = {
    persistAndRotateStates: jest.fn()
  }
  const memoryStorage = createInMemoryCacheComponent()
  const queuesStatusManager = createQueuesStatusManagerComponent({ memoryStorage })

  const sut = createTexturesProcessor({
    logs: logsMock,
    db: dbMock,
    catalyst: catalystMock,
    worlds: worldsMock,
    entityStatusFetcher: entityStatusFetcherMock,
    registryOrchestrator: registryOrchestratorMock,
    queuesStatusManager
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('return an error when the entity is not found in the database', async () => {
    dbMock.getRegistryById = jest.fn().mockResolvedValue(null)

    const result = await sut.process(mockTexturesEvent)

    expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
    expect(result).toEqual({
      ok: false,
      errors: [`Entity with id ${mockTexturesEvent.metadata.entityId} was not found`]
    })
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

  it('should fetch and create entity from Catalyst when not found in database', async () => {
    const catalystEntity = {
      id: mockTexturesEvent.metadata.entityId,
      timestamp: 123,
      metadata: { pointers: ['0,0'] }
    }

    dbMock.getRegistryById = jest.fn().mockResolvedValue(null)
    catalystMock.getEntityById = jest.fn().mockResolvedValue(catalystEntity)
    entityStatusFetcherMock.fetchBundleStatus.mockResolvedValue(Registry.SimplifiedStatus.COMPLETE)
    dbMock.upsertRegistryBundle = jest.fn().mockResolvedValue({
      id: mockTexturesEvent.metadata.entityId,
      status: Registry.SimplifiedStatus.PENDING,
      bundles: {}
    })
    registryOrchestratorMock.persistAndRotateStates.mockResolvedValue({
      ...catalystEntity,
      bundles: {
        assets: {
          windows: Registry.SimplifiedStatus.PENDING,
          mac: Registry.SimplifiedStatus.PENDING,
          webgl: Registry.SimplifiedStatus.PENDING
        },
        lods: {
          windows: Registry.SimplifiedStatus.PENDING,
          mac: Registry.SimplifiedStatus.PENDING,
          webgl: Registry.SimplifiedStatus.PENDING
        }
      }
    })

    const result = await sut.process(mockTexturesEvent)

    expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
    expect(catalystMock.getEntityById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
    expect(registryOrchestratorMock.persistAndRotateStates).toHaveBeenCalledWith({
      ...catalystEntity,
      deployer: '',
      bundles: {
        assets: {
          windows: Registry.SimplifiedStatus.PENDING,
          mac: Registry.SimplifiedStatus.PENDING,
          webgl: Registry.SimplifiedStatus.PENDING
        },
        lods: {
          windows: Registry.SimplifiedStatus.PENDING,
          mac: Registry.SimplifiedStatus.PENDING,
          webgl: Registry.SimplifiedStatus.PENDING
        }
      }
    })

    expect(result).toEqual({ ok: true })
  })

  it('should return error when entity is not found in database nor Catalyst', async () => {
    dbMock.getRegistryById = jest.fn().mockResolvedValue(null)
    catalystMock.getEntityById = jest.fn().mockResolvedValue(null)

    const result = await sut.process(mockTexturesEvent)

    expect(dbMock.getRegistryById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
    expect(catalystMock.getEntityById).toHaveBeenCalledWith(mockTexturesEvent.metadata.entityId)
    expect(result).toEqual({
      ok: false,
      errors: [`Entity with id ${mockTexturesEvent.metadata.entityId} was not found`]
    })
  })
})
