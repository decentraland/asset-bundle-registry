import { EntityType } from '@dcl/schemas'
import { Registry, RegistryOrchestratorComponent } from '../../../src/types'
import { createDbMockComponent } from '../mocks/db'
import { createLogMockComponent } from '../mocks/logs'
import { createRegistryOrchestratorComponent } from '../../../src/logic/registry-orchestrator'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { metricDeclarations } from '../../../src/metrics'

describe('registry orchestrator should', () => {
  const mockDb = createDbMockComponent()
  const logs = createLogMockComponent()
  const metrics = createTestMetricsComponent(metricDeclarations)
  const sut: RegistryOrchestratorComponent = createRegistryOrchestratorComponent({ metrics, db: mockDb, logs })

  const createRegistry = (partial: Partial<Registry.DbEntity> = {}): Registry.DbEntity => ({
    id: 'bafkreig4pgot2bf6iw3bfxgo4nn7ich35ztjfjhjdomz2yqmtmnagpxhjq',
    timestamp: 1729814400,
    status: Registry.Status.PENDING,
    type: EntityType.SCENE,
    deployer: '',
    pointers: ['0,0'],
    content: [],
    bundles: {
      assets: {
        mac: Registry.SimplifiedStatus.PENDING,
        windows: Registry.SimplifiedStatus.PENDING,
        webgl: Registry.SimplifiedStatus.PENDING
      },
      lods: {
        mac: Registry.SimplifiedStatus.PENDING,
        windows: Registry.SimplifiedStatus.PENDING,
        webgl: Registry.SimplifiedStatus.PENDING
      }
    },
    version: null,
    ...partial
  })

  const createRelativeRegistry = (timeOffset: number, status: Registry.Status, id: string = `registry-${timeOffset}`) =>
    createRegistry({
      id,
      timestamp: 1729814400 + timeOffset,
      status
    })

  const baseRegistry = createRegistry()
  const newerPendingRegistry = createRelativeRegistry(1000, Registry.Status.PENDING, 'newer-pending')
  const newerCompleteRegistry = createRelativeRegistry(1000, Registry.Status.COMPLETE, 'newer-complete')
  const newerFailedRegistry = createRelativeRegistry(1000, Registry.Status.FAILED, 'newer-failed')
  const olderPendingRegistry = createRelativeRegistry(-1000, Registry.Status.PENDING, 'older-pending')
  const olderCompleteRegistry = createRelativeRegistry(-1000, Registry.Status.COMPLETE, 'older-complete')

  const withAssetStatus = (
    registry: Registry.DbEntity,
    macStatus: Registry.SimplifiedStatus,
    windowsStatus: Registry.SimplifiedStatus
  ): Registry.DbEntity => ({
    ...registry,
    bundles: {
      ...registry.bundles,
      assets: {
        ...registry.bundles.assets,
        mac: macStatus,
        windows: windowsStatus
      }
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('mark registry as complete when all assets are complete and no newer registries exist', async () => {
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([])
    const registry = withAssetStatus(
      baseRegistry,
      Registry.SimplifiedStatus.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )

    await sut.persistAndRotateStates(registry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.COMPLETE })
    expect(mockDb.insertRegistry).toHaveBeenCalledTimes(1)
    expect(mockDb.updateRegistriesStatus).not.toHaveBeenCalled()
  })

  it('mark registry as failed when any asset processing fails', async () => {
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([])
    const registry = withAssetStatus(baseRegistry, Registry.SimplifiedStatus.COMPLETE, Registry.SimplifiedStatus.FAILED)

    await sut.persistAndRotateStates(registry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.FAILED })
    expect(mockDb.updateRegistriesStatus).not.toHaveBeenCalled()
  })

  it('maintain pending status when assets are still processing', async () => {
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([])
    const registry = withAssetStatus(baseRegistry, Registry.SimplifiedStatus.PENDING, Registry.SimplifiedStatus.PENDING)

    await sut.persistAndRotateStates(registry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.PENDING })
    expect(mockDb.updateRegistriesStatus).not.toHaveBeenCalled()
  })

  it('maintain pending status when some assets are complete but others are still processing', async () => {
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([])
    const registry = withAssetStatus(
      baseRegistry,
      Registry.SimplifiedStatus.PENDING,
      Registry.SimplifiedStatus.COMPLETE
    )

    await sut.persistAndRotateStates(registry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.PENDING })
    expect(mockDb.updateRegistriesStatus).not.toHaveBeenCalled()
  })

  it('mark registry as fallback when a newer pending registry exists', async () => {
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([newerPendingRegistry])
    const registry = withAssetStatus(
      baseRegistry,
      Registry.SimplifiedStatus.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )

    await sut.persistAndRotateStates(registry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.FALLBACK })
    expect(mockDb.updateRegistriesStatus).not.toHaveBeenCalled()
  })

  it('maintain pending status when multiple newer registries have mixed statuses', async () => {
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([newerPendingRegistry, newerFailedRegistry])

    await sut.persistAndRotateStates(baseRegistry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...baseRegistry, status: Registry.Status.PENDING })
    expect(mockDb.updateRegistriesStatus).not.toHaveBeenCalled()
  })

  it('mark registry as complete and mark older pending registries as obsolete', async () => {
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([olderPendingRegistry])
    const registry = withAssetStatus(
      baseRegistry,
      Registry.SimplifiedStatus.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )

    await sut.persistAndRotateStates(registry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.COMPLETE })
    expect(mockDb.insertRegistry).toHaveBeenCalledTimes(1)
    expect(mockDb.updateRegistriesStatus).toHaveBeenCalledWith([olderPendingRegistry.id], Registry.Status.OBSOLETE)
    expect(mockDb.updateRegistriesStatus).toHaveBeenCalledTimes(1)
  })

  it('mark registry as obsolete when a newer complete registry exists', async () => {
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([newerCompleteRegistry])

    await sut.persistAndRotateStates(baseRegistry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...baseRegistry, status: Registry.Status.OBSOLETE })
    expect(mockDb.updateRegistriesStatus).not.toHaveBeenCalled()
  })

  it('mark older complete registry as fallback when current registry fails', async () => {
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([olderCompleteRegistry])
    const registry = withAssetStatus(baseRegistry, Registry.SimplifiedStatus.FAILED, Registry.SimplifiedStatus.FAILED)

    await sut.persistAndRotateStates(registry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.FAILED })
    expect(mockDb.updateRegistriesStatus).toHaveBeenCalledWith([olderCompleteRegistry.id], Registry.Status.FALLBACK)
  })

  it('mark older fallback registry as obsolete when current registry completes', async () => {
    const olderFallbackRegistry = createRelativeRegistry(-1000, Registry.Status.FALLBACK, 'older-fallback')
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([olderFallbackRegistry])

    const registry = withAssetStatus(
      baseRegistry,
      Registry.SimplifiedStatus.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )

    await sut.persistAndRotateStates(registry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.COMPLETE })
    expect(mockDb.updateRegistriesStatus).toHaveBeenCalledWith([olderFallbackRegistry.id], Registry.Status.OBSOLETE)
  })

  it('mark older pending as obsolete and older complete as fallback when current registry fails', async () => {
    mockDb.getRelatedRegistries = jest.fn().mockResolvedValue([olderPendingRegistry, olderCompleteRegistry])
    const registry = withAssetStatus(baseRegistry, Registry.SimplifiedStatus.FAILED, Registry.SimplifiedStatus.FAILED)

    await sut.persistAndRotateStates(registry)
    expect(mockDb.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.FAILED })
    expect(mockDb.updateRegistriesStatus).toHaveBeenCalledWith([olderPendingRegistry.id], Registry.Status.OBSOLETE)
    expect(mockDb.updateRegistriesStatus).toHaveBeenCalledWith([olderCompleteRegistry.id], Registry.Status.FALLBACK)
  })
})
