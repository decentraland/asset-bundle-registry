import { EntityType } from '@dcl/schemas'
import { Registry } from '../../../../src/types'
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
    describe('and the registry is a Genesis City scene', () => {
      let registry: Registry.DbEntity

      beforeEach(() => {
        registry = withAssetStatus(
          createRegistry(),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )
        db.getRelatedRegistries.mockResolvedValue([])
      })

      it('should call getRelatedRegistries without a world name', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.getRelatedRegistries).toHaveBeenCalledWith(registry, undefined)
      })
    })

    describe('and the registry is a world scene', () => {
      let registry: Registry.DbEntity

      beforeEach(() => {
        registry = withAssetStatus(
          createRegistry({
            type: 'world',
            metadata: { worldConfiguration: { name: 'my-world.dcl.eth' }, scene: { parcels: ['0,0'], base: '0,0' } }
          }),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )
        db.getRelatedRegistries.mockResolvedValue([])
      })

      it('should call getRelatedRegistries with the world name', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.getRelatedRegistries).toHaveBeenCalledWith(registry, 'my-world.dcl.eth')
      })
    })

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
    let eventTimestamp: number

    beforeEach(() => {
      entityIds = ['entity-1', 'entity-2']
      eventTimestamp = Date.now()
    })

    describe('when the undeployment is successful and a world is found', () => {
      beforeEach(() => {
        db.undeployWorldScenes.mockResolvedValue({
          undeployedCount: 2,
          worldName: 'test-world'
        })
      })

      it('should undeploy the world scenes for the given entity IDs with the event timestamp', async () => {
        await component.undeployWorldScenes(entityIds, eventTimestamp)

        expect(db.undeployWorldScenes).toHaveBeenCalledWith(entityIds, eventTimestamp)
      })

      it('should recalculate the spawn coordinates for the affected world', async () => {
        await component.undeployWorldScenes(entityIds, eventTimestamp)

        expect(coordinates.recalculateSpawnIfNeeded).toHaveBeenCalledWith('test-world', eventTimestamp)
      })

      it('should return the undeployment result', async () => {
        const result = await component.undeployWorldScenes(entityIds, eventTimestamp)

        expect(result).toEqual({
          undeployedCount: 2,
          worldName: 'test-world'
        })
      })
    })

    describe('when no world is found in the registries', () => {
      beforeEach(() => {
        db.undeployWorldScenes.mockResolvedValue({
          undeployedCount: 0,
          worldName: null
        })
      })

      it('should not recalculate spawn coordinates', async () => {
        await component.undeployWorldScenes(entityIds, eventTimestamp)

        expect(coordinates.recalculateSpawnIfNeeded).not.toHaveBeenCalled()
      })

      it('should return the undeployment result with null worldName', async () => {
        const result = await component.undeployWorldScenes(entityIds, eventTimestamp)

        expect(result).toEqual({
          undeployedCount: 0,
          worldName: null
        })
      })
    })
  })

  describe('when undeploying a world', () => {
    let worldName: string
    let eventTimestamp: number

    beforeEach(() => {
      worldName = 'test-world'
      eventTimestamp = Date.now()
    })

    describe('and the undeployment is successful and registries are found', () => {
      beforeEach(() => {
        db.undeployWorldByName.mockResolvedValue({
          undeployedCount: 3,
          worldName: 'test-world'
        })
      })

      it('should undeploy all registries belonging to the world with the event timestamp', async () => {
        await component.undeployWorld(worldName, eventTimestamp)

        expect(db.undeployWorldByName).toHaveBeenCalledWith(worldName, eventTimestamp)
      })

      it('should recalculate the spawn coordinates for the world', async () => {
        await component.undeployWorld(worldName, eventTimestamp)

        expect(coordinates.recalculateSpawnIfNeeded).toHaveBeenCalledWith('test-world', eventTimestamp)
      })

      it('should return the undeployment result', async () => {
        const result = await component.undeployWorld(worldName, eventTimestamp)

        expect(result).toEqual({
          undeployedCount: 3,
          worldName: 'test-world'
        })
      })
    })

    describe('and there are no registries for the world', () => {
      beforeEach(() => {
        db.undeployWorldByName.mockResolvedValue({
          undeployedCount: 0,
          worldName: 'test-world'
        })
      })

      it('should not recalculate spawn coordinates', async () => {
        await component.undeployWorld(worldName, eventTimestamp)

        expect(coordinates.recalculateSpawnIfNeeded).not.toHaveBeenCalled()
      })

      it('should return the undeployment result', async () => {
        const result = await component.undeployWorld(worldName, eventTimestamp)

        expect(result).toEqual({
          undeployedCount: 0,
          worldName: 'test-world'
        })
      })
    })
  })
})
