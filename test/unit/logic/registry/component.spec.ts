import { EntityType } from '@dcl/schemas'
import { Registry, SpawnRecalculationParams } from '../../../../src/types'
import { createDbMockComponent } from '../../mocks/db'
import { createLogMockComponent } from '../../mocks/logs'
import { createCoordinatesMockComponent } from '../../mocks/coordinates'
import { createRegistryComponent, IRegistryComponent } from '../../../../src/logic/registry'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { metricDeclarations } from '../../../../src/metrics'

describe('when using the registry component', () => {
  let db: ReturnType<typeof createDbMockComponent>
  let logs: ReturnType<typeof createLogMockComponent>
  let metrics: ReturnType<typeof createTestMetricsComponent>
  let coordinates: ReturnType<typeof createCoordinatesMockComponent>
  let component: IRegistryComponent

  beforeEach(() => {
    db = createDbMockComponent()
    logs = createLogMockComponent()
    metrics = createTestMetricsComponent(metricDeclarations)
    coordinates = createCoordinatesMockComponent()
    component = createRegistryComponent({ db, logs, metrics, coordinates })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  function createRegistry(partial: Partial<Registry.DbEntity> = {}): Registry.DbEntity {
    return {
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
      versions: {
        assets: {
          windows: { version: '', buildDate: '' },
          mac: { version: '', buildDate: '' },
          webgl: { version: '', buildDate: '' }
        }
      },
      ...partial
    }
  }

  function createRelativeRegistry(
    timeOffset: number,
    status: Registry.Status,
    id: string = `registry-${timeOffset}`
  ): Registry.DbEntity {
    return createRegistry({
      id,
      timestamp: 1729814400 + timeOffset,
      status
    })
  }

  function withAssetStatus(
    registry: Registry.DbEntity,
    macStatus: Registry.SimplifiedStatus,
    windowsStatus: Registry.SimplifiedStatus
  ): Registry.DbEntity {
    return {
      ...registry,
      bundles: {
        ...registry.bundles,
        assets: {
          ...registry.bundles.assets,
          mac: macStatus,
          windows: windowsStatus
        }
      }
    }
  }

  describe('when rotating the state of a registry', () => {
    describe('and there are no related registries', () => {
      beforeEach(() => {
        db.getRelatedRegistries.mockResolvedValue([])
      })

      describe('and all assets are complete', () => {
        let registry: Registry.DbEntity

        beforeEach(() => {
          registry = withAssetStatus(
            createRegistry(),
            Registry.SimplifiedStatus.COMPLETE,
            Registry.SimplifiedStatus.COMPLETE
          )
        })

        it('should mark the registry as complete and not update any other registries', async () => {
          await component.persistAndRotateStates(registry)

          expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.COMPLETE })
          expect(db.updateRegistriesStatus).not.toHaveBeenCalled()
        })
      })

      describe('and any asset processing fails', () => {
        let registry: Registry.DbEntity

        beforeEach(() => {
          registry = withAssetStatus(
            createRegistry(),
            Registry.SimplifiedStatus.COMPLETE,
            Registry.SimplifiedStatus.FAILED
          )
        })

        it('should mark the registry as failed and not update any other registries', async () => {
          await component.persistAndRotateStates(registry)

          expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.FAILED })
          expect(db.updateRegistriesStatus).not.toHaveBeenCalled()
        })
      })

      describe('and assets are still processing', () => {
        let registry: Registry.DbEntity

        beforeEach(() => {
          registry = withAssetStatus(
            createRegistry(),
            Registry.SimplifiedStatus.PENDING,
            Registry.SimplifiedStatus.PENDING
          )
        })

        it('should maintain the pending status of the registry and not update any other registries', async () => {
          await component.persistAndRotateStates(registry)

          expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.PENDING })
          expect(db.updateRegistriesStatus).not.toHaveBeenCalled()
        })
      })

      describe('and some assets are complete but others are still processing', () => {
        let registry: Registry.DbEntity

        beforeEach(() => {
          registry = withAssetStatus(
            createRegistry(),
            Registry.SimplifiedStatus.PENDING,
            Registry.SimplifiedStatus.COMPLETE
          )
        })

        it('should maintain pending status', async () => {
          await component.persistAndRotateStates(registry)

          expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.PENDING })
        })
      })
    })

    describe('when there is a newer pending registry', () => {
      let registry: Registry.DbEntity
      let newerPendingRegistry: Registry.DbEntity

      beforeEach(() => {
        newerPendingRegistry = createRelativeRegistry(1000, Registry.Status.PENDING, 'newer-pending')
        db.getRelatedRegistries.mockResolvedValue([newerPendingRegistry])
        registry = withAssetStatus(
          createRegistry(),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )
      })

      it('should mark the registry as fallback and not update the newer registry', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.FALLBACK })
        expect(db.updateRegistriesStatus).not.toHaveBeenCalled()
      })
    })

    describe('and there is a newer complete registry', () => {
      let registry: Registry.DbEntity
      let newerCompleteRegistry: Registry.DbEntity

      beforeEach(() => {
        newerCompleteRegistry = createRelativeRegistry(1000, Registry.Status.COMPLETE, 'newer-complete')
        db.getRelatedRegistries.mockResolvedValue([newerCompleteRegistry])
        registry = createRegistry()
      })

      it('should mark registry as obsolete', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.OBSOLETE })
      })
    })

    describe('and there are multiple newer registries with mixed statuses', () => {
      let registry: Registry.DbEntity

      beforeEach(() => {
        const newerPendingRegistry = createRelativeRegistry(1000, Registry.Status.PENDING, 'newer-pending')
        const newerFailedRegistry = createRelativeRegistry(1000, Registry.Status.FAILED, 'newer-failed')
        db.getRelatedRegistries.mockResolvedValue([newerPendingRegistry, newerFailedRegistry])
        registry = createRegistry()
      })

      it('should maintain pending status', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.PENDING })
      })
    })

    describe('and there is an older pending registry', () => {
      let registry: Registry.DbEntity
      let olderPendingRegistry: Registry.DbEntity

      beforeEach(() => {
        olderPendingRegistry = createRelativeRegistry(-1000, Registry.Status.PENDING, 'older-pending')
        db.getRelatedRegistries.mockResolvedValue([olderPendingRegistry])
        registry = withAssetStatus(
          createRegistry(),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )
      })

      it('should mark the registry as complete and mark the older pending registry as obsolete', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.COMPLETE })
        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([olderPendingRegistry.id], Registry.Status.OBSOLETE)
      })
    })

    describe('when there is an older complete registry and current registry fails', () => {
      let registry: Registry.DbEntity
      let olderCompleteRegistry: Registry.DbEntity

      beforeEach(() => {
        olderCompleteRegistry = createRelativeRegistry(-1000, Registry.Status.COMPLETE, 'older-complete')
        db.getRelatedRegistries.mockResolvedValue([olderCompleteRegistry])
        registry = withAssetStatus(createRegistry(), Registry.SimplifiedStatus.FAILED, Registry.SimplifiedStatus.FAILED)
      })

      it('should mark the registry as failed and mark the older complete registry as fallback', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.FAILED })
        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([olderCompleteRegistry.id], Registry.Status.FALLBACK)
      })
    })

    describe('when there is an older fallback registry and current registry completes', () => {
      let registry: Registry.DbEntity
      let olderFallbackRegistry: Registry.DbEntity

      beforeEach(() => {
        olderFallbackRegistry = createRelativeRegistry(-1000, Registry.Status.FALLBACK, 'older-fallback')
        db.getRelatedRegistries.mockResolvedValue([olderFallbackRegistry])
        registry = withAssetStatus(
          createRegistry(),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )
      })

      it('should mark the registry as complete and mark the older pending registry as obsolete', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.COMPLETE })
        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([olderFallbackRegistry.id], Registry.Status.OBSOLETE)
      })
    })

    // TODO: Check if this is the correct behavior
    describe('when there are older pending and complete registries and current registry fails', () => {
      let registry: Registry.DbEntity
      let olderPendingRegistry: Registry.DbEntity
      let olderCompleteRegistry: Registry.DbEntity

      beforeEach(() => {
        olderPendingRegistry = createRelativeRegistry(-1000, Registry.Status.PENDING, 'older-pending')
        olderCompleteRegistry = createRelativeRegistry(-1000, Registry.Status.COMPLETE, 'older-complete')
        db.getRelatedRegistries.mockResolvedValue([olderPendingRegistry, olderCompleteRegistry])
        registry = withAssetStatus(createRegistry(), Registry.SimplifiedStatus.FAILED, Registry.SimplifiedStatus.FAILED)
      })

      it('should mark registry as failed', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.FAILED })
      })

      it('should mark older pending registry as obsolete', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([olderPendingRegistry.id], Registry.Status.OBSOLETE)
      })

      it('should mark older complete registry as fallback', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([olderCompleteRegistry.id], Registry.Status.FALLBACK)
      })
    })
  })

  describe('and calling undeployWorldScenes', () => {
    let entityIds: string[]

    beforeEach(() => {
      entityIds = ['entity-1', 'entity-2']
    })

    describe('when the undeployment is successful', () => {
      let undeploymentResult: any

      beforeEach(() => {
        undeploymentResult = {
          undeployedCount: 2,
          affectedWorlds: ['world-1'],
          spawnCoordinatesUpdated: ['world-1']
        }
        db.undeployWorldScenes.mockResolvedValue(undeploymentResult)
      })

      it('should call undeploy the world scenes with the entity IDs and spawn calculation function', async () => {
        await component.undeployWorldScenes(entityIds)

        expect(db.undeployWorldScenes).toHaveBeenCalledWith(entityIds, expect.any(Function))
        expect(coordinates.calculateCenter).toHaveBeenCalledWith(['0,0', '1,0'])
      })
    })

    describe('and the spawn calculation function is invoked', () => {
      let capturedCalculateSpawnAction: ((params: SpawnRecalculationParams) => any) | null

      beforeEach(() => {
        capturedCalculateSpawnAction = null
        db.undeployWorldScenes.mockImplementation(async (_entityIds, calculateSpawn) => {
          capturedCalculateSpawnAction = calculateSpawn
          return { undeployedCount: 0, affectedWorlds: [], spawnCoordinatesUpdated: [] }
        })
      })

      describe('and the world has no parcels', () => {
        it('should return delete action', async () => {
          await component.undeployWorldScenes(entityIds)

          const result = capturedCalculateSpawnAction!({
            worldName: 'test-world',
            parcels: [],
            currentSpawn: null
          })

          expect(result).toEqual({ action: 'delete' })
        })
      })

      describe('and there is no current spawn', () => {
        beforeEach(() => {
          coordinates.calculateCenter.mockReturnValue({ x: 1, y: 0 })
        })

        it('should return upsert action with calculated center', async () => {
          await component.undeployWorldScenes(entityIds)

          const result = capturedCalculateSpawnAction!({
            worldName: 'test-world',
            parcels: ['0,0', '1,0', '2,0'],
            currentSpawn: null
          })

          expect(result).toEqual({ action: 'upsert', x: 1, y: 0, isUserSet: false })
        })
      })

      describe('and the current spawn is not user-set', () => {
        beforeEach(() => {
          coordinates.calculateCenter.mockReturnValue({ x: 2, y: 0 })
        })

        it('should return upsert action with recalculated center', async () => {
          await component.undeployWorldScenes(entityIds)

          const result = capturedCalculateSpawnAction!({
            worldName: 'test-world',
            parcels: ['0,0', '1,0', '2,0', '3,0', '4,0'],
            currentSpawn: { worldName: 'test-world', x: 0, y: 0, isUserSet: false, timestamp: Date.now() }
          })

          expect(result).toEqual({ action: 'upsert', x: 2, y: 0, isUserSet: false })
        })
      })

      describe('and the current spawn is user-set and still valid', () => {
        beforeEach(() => {
          coordinates.isCoordinateInParcels.mockReturnValue(true)
        })

        it('should return none action', async () => {
          await component.undeployWorldScenes(entityIds)

          const result = capturedCalculateSpawnAction!({
            worldName: 'test-world',
            parcels: ['0,0', '1,0', '2,0'],
            currentSpawn: { worldName: 'test-world', x: 1, y: 0, isUserSet: true, timestamp: Date.now() }
          })

          expect(result).toEqual({ action: 'none' })
        })
      })

      describe('and the current spawn is user-set but no longer valid', () => {
        beforeEach(() => {
          coordinates.isCoordinateInParcels.mockReturnValue(false)
          coordinates.calculateCenter.mockReturnValue({ x: 6, y: 5 })
        })

        it('should return upsert action with recalculated center', async () => {
          await component.undeployWorldScenes(entityIds)

          const result = capturedCalculateSpawnAction!({
            worldName: 'test-world',
            parcels: ['5,5', '6,5', '7,5'],
            currentSpawn: { worldName: 'test-world', x: 0, y: 0, isUserSet: true, timestamp: Date.now() }
          })

          expect(result).toEqual({ action: 'upsert', x: 6, y: 5, isUserSet: false })
        })
      })
    })
  })
})
