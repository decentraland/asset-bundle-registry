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
    describe('and there are no related registries', () => {
      beforeEach(() => {
        db.getRelatedRegistries.mockResolvedValue([])
      })

      it('should call getRelatedRegistries with the registry', async () => {
        const registry = withAssetStatus(
          createRegistry(),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )

        await component.persistAndRotateStates(registry)

        expect(db.getRelatedRegistries).toHaveBeenCalledWith(registry)
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

      it('should mark the registry as complete and not update the newer registry', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.COMPLETE })
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

      it('should mark the registry as complete and not mark the older pending registry as obsolete', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.insertRegistry).toHaveBeenCalledWith({ ...registry, status: Registry.Status.COMPLETE })
        expect(db.updateRegistriesStatus).not.toHaveBeenCalled()
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

      it('should not mark older pending registry as obsolete', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.updateRegistriesStatus).not.toHaveBeenCalledWith([olderPendingRegistry.id], Registry.Status.OBSOLETE)
      })

      it('should mark older complete registry as fallback', async () => {
        await component.persistAndRotateStates(registry)

        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([olderCompleteRegistry.id], Registry.Status.FALLBACK)
      })
    })
  })

  describe('when a world scene overlaps an existing one and the new scene fails conversion', () => {
    describe('and there are two scenes (A complete, B overlapping and failing)', () => {
      let sceneA: Registry.DbEntity
      let sceneB: Registry.DbEntity

      beforeEach(() => {
        sceneA = withAssetStatus(
          createRelativeRegistry(-1000, Registry.Status.COMPLETE, 'scene-a'),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )
      })

      it('should keep scene A as fallback when scene B is first deployed as pending', async () => {
        sceneB = createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b')

        db.getRelatedRegistries.mockResolvedValue([sceneA])

        await component.persistAndRotateStates(sceneB)

        expect(db.insertRegistry).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'scene-b', status: Registry.Status.PENDING })
        )
        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([sceneA.id], Registry.Status.FALLBACK)
      })

      it('should keep scene A as fallback when scene B fails conversion', async () => {
        sceneA = createRelativeRegistry(-1000, Registry.Status.FALLBACK, 'scene-a')
        sceneB = withAssetStatus(
          createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b'),
          Registry.SimplifiedStatus.FAILED,
          Registry.SimplifiedStatus.FAILED
        )

        db.getRelatedRegistries.mockResolvedValue([sceneA])

        await component.persistAndRotateStates(sceneB)

        expect(db.insertRegistry).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'scene-b', status: Registry.Status.FAILED })
        )
        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([sceneA.id], Registry.Status.FALLBACK)
      })

      it('should not mark scene A as obsolete when scene B fails', async () => {
        sceneA = createRelativeRegistry(-1000, Registry.Status.FALLBACK, 'scene-a')
        sceneB = withAssetStatus(
          createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b'),
          Registry.SimplifiedStatus.FAILED,
          Registry.SimplifiedStatus.COMPLETE
        )

        db.getRelatedRegistries.mockResolvedValue([sceneA])

        await component.persistAndRotateStates(sceneB)

        expect(db.updateRegistriesStatus).not.toHaveBeenCalledWith([sceneA.id], Registry.Status.OBSOLETE)
      })
    })

    describe('and there are three rapid deployments (A complete, B and C overlapping, both fail)', () => {
      let sceneA: Registry.DbEntity
      let sceneB: Registry.DbEntity
      let sceneC: Registry.DbEntity

      beforeEach(() => {
        sceneA = withAssetStatus(
          createRelativeRegistry(-2000, Registry.Status.FALLBACK, 'scene-a'),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )
        sceneB = createRelativeRegistry(-1000, Registry.Status.PENDING, 'scene-b')
        sceneC = createRelativeRegistry(0, Registry.Status.PENDING, 'scene-c')
      })

      it('should keep scene A as fallback when scene C is deployed (not marking scene B as obsolete)', async () => {
        db.getRelatedRegistries.mockResolvedValue([sceneA, sceneB])

        await component.persistAndRotateStates(sceneC)

        expect(db.insertRegistry).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'scene-c', status: Registry.Status.PENDING })
        )
        expect(db.updateRegistriesStatus).not.toHaveBeenCalledWith(['scene-b'], Registry.Status.OBSOLETE)
        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([sceneA.id], Registry.Status.FALLBACK)
      })

      it('should keep scene A as fallback when scene C fails conversion', async () => {
        sceneC = withAssetStatus(sceneC, Registry.SimplifiedStatus.FAILED, Registry.SimplifiedStatus.FAILED)

        // Scene B is now obsolete, so only scene A appears in related registries
        db.getRelatedRegistries.mockResolvedValue([sceneA])

        await component.persistAndRotateStates(sceneC)

        expect(db.insertRegistry).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'scene-c', status: Registry.Status.FAILED })
        )
        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([sceneA.id], Registry.Status.FALLBACK)
        expect(db.updateRegistriesStatus).not.toHaveBeenCalledWith([sceneA.id], Registry.Status.OBSOLETE)
      })
    })

    describe('and the older scene was complete, a newer overlapping scene completes, then a third fails', () => {
      let sceneA: Registry.DbEntity
      let sceneB: Registry.DbEntity
      let sceneC: Registry.DbEntity

      it('should mark scene A as obsolete when scene B completes', async () => {
        sceneA = withAssetStatus(
          createRelativeRegistry(-2000, Registry.Status.FALLBACK, 'scene-a'),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )
        sceneB = withAssetStatus(
          createRelativeRegistry(-1000, Registry.Status.PENDING, 'scene-b'),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )

        db.getRelatedRegistries.mockResolvedValue([sceneA])

        await component.persistAndRotateStates(sceneB)

        expect(db.insertRegistry).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'scene-b', status: Registry.Status.COMPLETE })
        )
        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([sceneA.id], Registry.Status.OBSOLETE)
      })

      it('should keep scene B as fallback when scene C is deployed and then fails', async () => {
        sceneB = withAssetStatus(
          createRelativeRegistry(-1000, Registry.Status.FALLBACK, 'scene-b'),
          Registry.SimplifiedStatus.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE
        )
        sceneC = withAssetStatus(
          createRelativeRegistry(0, Registry.Status.PENDING, 'scene-c'),
          Registry.SimplifiedStatus.FAILED,
          Registry.SimplifiedStatus.FAILED
        )

        // Scene A is obsolete, only scene B appears in related registries
        db.getRelatedRegistries.mockResolvedValue([sceneB])

        await component.persistAndRotateStates(sceneC)

        expect(db.insertRegistry).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'scene-c', status: Registry.Status.FAILED })
        )
        expect(db.updateRegistriesStatus).toHaveBeenCalledWith([sceneB.id], Registry.Status.FALLBACK)
        expect(db.updateRegistriesStatus).not.toHaveBeenCalledWith([sceneB.id], Registry.Status.OBSOLETE)
      })
    })
  })

  describe('when concurrent texture events would have caused a race condition', () => {
    /**
     * This test verifies that updateBundleAndRotateStates prevents the following race condition
     * that was possible with the old non-atomic persistAndRotateStates:
     *
     * 1. Scene A is COMPLETE, Scene B is deployed → A becomes FALLBACK, B is PENDING
     * 2. B's mac and windows conversions complete concurrently (two SQS messages)
     * 3. Thread 2 (windows) processes first:
     *    - upsertRegistryBundle sets B.windows = COMPLETE
     *    - RETURNING * gives B with mac=COMPLETE, windows=COMPLETE
     *    - persistAndRotateStates → B = COMPLETE, A → OBSOLETE
     * 4. Thread 1 (mac) processes after, but read B from DB BEFORE Thread 2's upsert:
     *    - upsertRegistryBundle set B.mac = COMPLETE earlier
     *    - But Thread 1's registryEntity snapshot still has windows=PENDING (stale)
     *    - OLD BUG: persistAndRotateStates → B = PENDING (stale overwrite!)
     *
     * With updateBundleAndRotateStates, the status is determined from the current DB state
     * inside a transaction AFTER the bundle update, so Thread 1 would see both platforms as
     * COMPLETE and correctly determine B = COMPLETE.
     */
    it('should not overwrite scene B to pending with stale data after it was already set to complete', async () => {
      const sceneA = withAssetStatus(
        createRelativeRegistry(-1000, Registry.Status.FALLBACK, 'scene-a'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      // The DB transaction always reads the CURRENT entity state after updating the bundle.
      // Even though Thread 1's caller had stale data (windows=PENDING), the transaction reads
      // the entity AFTER upsertRegistryBundle, which reflects both mac=COMPLETE and windows=COMPLETE.
      const sceneBCurrentDbState = withAssetStatus(
        createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      db.persistRegistryInTransaction.mockImplementation(async (params) => {
        // The transaction reads the entity's CURRENT state from DB (both platforms complete)
        const result = params.determineStatusAndRotate(sceneBCurrentDbState, [sceneA])
        return { ...sceneBCurrentDbState, status: result.status }
      })

      const updated = await component.updateBundleAndRotateStates({
        bundleUpdate: {
          entityId: 'scene-b',
          platform: 'mac',
          isLods: false,
          status: Registry.SimplifiedStatus.COMPLETE
        }
      })

      // B is correctly determined as COMPLETE from the current DB state, not PENDING from stale data
      expect(updated!.status).not.toBe(Registry.Status.PENDING)
      expect(updated!.status).toBe(Registry.Status.COMPLETE)
    })

    it('should not leave the world without a fallback after concurrent texture events', async () => {
      const sceneA = withAssetStatus(
        createRelativeRegistry(-1000, Registry.Status.FALLBACK, 'scene-a'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      // Because the transaction reads the current DB state, B's status is correctly set to COMPLETE.
      // When Scene C is later deployed and fails, B (COMPLETE) would be demoted to FALLBACK — not OBSOLETE.
      const sceneBComplete = withAssetStatus(
        createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      let capturedResult: any = null
      db.persistRegistryInTransaction.mockImplementation(async (params) => {
        const result = params.determineStatusAndRotate(sceneBComplete, [sceneA])
        capturedResult = result
        return { ...sceneBComplete, status: result.status }
      })

      await component.updateBundleAndRotateStates({
        bundleUpdate: {
          entityId: 'scene-b',
          platform: 'windows',
          isLods: false,
          status: Registry.SimplifiedStatus.COMPLETE
        }
      })

      // B = COMPLETE, A's fallback is correctly marked OBSOLETE (because B successfully completed)
      expect(capturedResult.status).toBe(Registry.Status.COMPLETE)
      expect(capturedResult.fallbackUpdate).toEqual({
        id: sceneA.id,
        status: Registry.Status.OBSOLETE
      })

      // Now verify: if C is deployed and fails, B (now COMPLETE → FALLBACK) would NOT be marked OBSOLETE.
      // The race condition would have left B as PENDING (stuck), causing it to be marked OBSOLETE
      // when C arrived. With the fix, B is correctly COMPLETE, so it becomes FALLBACK — surviving the purger.
      const sceneBFallback = withAssetStatus(
        createRelativeRegistry(0, Registry.Status.FALLBACK, 'scene-b'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )
      const sceneCFailed = withAssetStatus(
        createRelativeRegistry(1000, Registry.Status.PENDING, 'scene-c'),
        Registry.SimplifiedStatus.FAILED,
        Registry.SimplifiedStatus.FAILED
      )

      db.persistRegistryInTransaction.mockImplementation(async (params) => {
        const result = params.determineStatusAndRotate(sceneCFailed, [sceneBFallback])
        capturedResult = result
        return { ...sceneCFailed, status: result.status }
      })

      await component.updateBundleAndRotateStates({
        bundleUpdate: {
          entityId: 'scene-c',
          platform: 'mac',
          isLods: false,
          status: Registry.SimplifiedStatus.FAILED
        }
      })

      // C = FAILED, no rotation happens — B is untouched
      expect(capturedResult.status).toBe(Registry.Status.FAILED)
      expect(capturedResult.fallbackUpdate).toBeNull()
      expect(capturedResult.olderEntityIds).toEqual([])
    })
  })

  describe('when using updateBundleAndRotateStates (atomic)', () => {
    /**
     * updateBundleAndRotateStates prevents the race condition by reading the current entity state
     * from the DB inside a transaction AFTER updating the bundle, instead of trusting the caller's
     * potentially stale data.
     */
    it('should determine status from current DB state, not stale caller data', async () => {
      const sceneA = withAssetStatus(
        createRelativeRegistry(-1000, Registry.Status.FALLBACK, 'scene-a'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      // Simulate what persistRegistryInTransaction does:
      // After upsertRegistryBundle, the DB returns the entity with CURRENT bundles (both complete),
      // regardless of what the caller's snapshot had.
      const sceneBCurrentDbState = withAssetStatus(
        createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      // The DB transaction mock calls determineStatusAndRotate with the current DB entity
      db.persistRegistryInTransaction.mockImplementation(async (params) => {
        const { determineStatusAndRotate } = params
        // The transaction reads the entity's CURRENT state from DB (both platforms complete)
        const result = determineStatusAndRotate(sceneBCurrentDbState, [sceneA])
        return { ...sceneBCurrentDbState, status: result.status }
      })

      const updated = await component.updateBundleAndRotateStates({
        bundleUpdate: {
          entityId: 'scene-b',
          platform: 'mac',
          isLods: false,
          status: Registry.SimplifiedStatus.COMPLETE
        }
      })

      // The status is determined from the current DB state (both platforms complete),
      // NOT from the caller's stale data. With scene A (FALLBACK) as the only related entity
      // and no newer entities, B should be COMPLETE.
      expect(updated!.status).toBe(Registry.Status.COMPLETE)
    })

    it('should correctly mark the fallback as obsolete when the entity completes', async () => {
      const sceneA = withAssetStatus(
        createRelativeRegistry(-1000, Registry.Status.FALLBACK, 'scene-a'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      const sceneBComplete = withAssetStatus(
        createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      let capturedResult: any = null
      db.persistRegistryInTransaction.mockImplementation(async (params) => {
        const result = params.determineStatusAndRotate(sceneBComplete, [sceneA])
        capturedResult = result
        return { ...sceneBComplete, status: result.status }
      })

      await component.updateBundleAndRotateStates({
        bundleUpdate: {
          entityId: 'scene-b',
          platform: 'windows',
          isLods: false,
          status: Registry.SimplifiedStatus.COMPLETE
        }
      })

      expect(capturedResult.status).toBe(Registry.Status.COMPLETE)
      expect(capturedResult.fallbackUpdate).toEqual({
        id: sceneA.id,
        status: Registry.Status.OBSOLETE
      })
    })

    it('should keep the fallback when the entity fails', async () => {
      const sceneA = withAssetStatus(
        createRelativeRegistry(-1000, Registry.Status.FALLBACK, 'scene-a'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      const sceneBFailed = withAssetStatus(
        createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b'),
        Registry.SimplifiedStatus.FAILED,
        Registry.SimplifiedStatus.COMPLETE
      )

      let capturedResult: any = null
      db.persistRegistryInTransaction.mockImplementation(async (params) => {
        const result = params.determineStatusAndRotate(sceneBFailed, [sceneA])
        capturedResult = result
        return { ...sceneBFailed, status: result.status }
      })

      await component.updateBundleAndRotateStates({
        bundleUpdate: {
          entityId: 'scene-b',
          platform: 'mac',
          isLods: false,
          status: Registry.SimplifiedStatus.FAILED
        }
      })

      expect(capturedResult.status).toBe(Registry.Status.FAILED)
      expect(capturedResult.olderEntityIds).toEqual([])
      expect(capturedResult.fallbackUpdate).toBeNull()
    })

    it('should pass version update to the transaction when provided', async () => {
      const sceneB = createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b')

      db.persistRegistryInTransaction.mockImplementation(async (params) => {
        const result = params.determineStatusAndRotate(sceneB, [])
        return { ...sceneB, status: result.status }
      })

      await component.updateBundleAndRotateStates({
        bundleUpdate: {
          entityId: 'scene-b',
          platform: 'mac',
          isLods: false,
          status: Registry.SimplifiedStatus.COMPLETE
        },
        versionUpdate: {
          entityId: 'scene-b',
          platform: 'mac',
          version: '1.0.0',
          buildDate: '2026-01-01'
        }
      })

      expect(db.persistRegistryInTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleUpdate: expect.objectContaining({ entityId: 'scene-b', platform: 'mac' }),
          versionUpdate: expect.objectContaining({ version: '1.0.0', buildDate: '2026-01-01' })
        })
      )
    })
  })

  describe('when a redeployment arrives before the first scene finishes conversion', () => {
    it('should not mark the older pending entity as obsolete during deployment', async () => {
      const sceneA = createRelativeRegistry(-1000, Registry.Status.PENDING, 'scene-a')
      const sceneB = createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b')

      db.getRelatedRegistries.mockResolvedValue([sceneA])

      await component.persistAndRotateStates(sceneB)

      expect(db.insertRegistry).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'scene-b', status: Registry.Status.PENDING })
      )
      // Older PENDING entities are NOT marked as OBSOLETE during deployment
      expect(db.updateRegistriesStatus).not.toHaveBeenCalled()
    })

    it('should allow the older entity to complete and become the active scene when the newer fails', async () => {
      // Scene A completes after being left as PENDING (not marked OBSOLETE by B's deployment)
      const sceneAComplete = withAssetStatus(
        createRelativeRegistry(-1000, Registry.Status.PENDING, 'scene-a'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      // Scene B (newer) is still PENDING — no newer COMPLETE/FALLBACK
      const sceneBPending = createRelativeRegistry(1000, Registry.Status.PENDING, 'scene-b')

      let capturedResult: any = null
      db.persistRegistryInTransaction.mockImplementation(async (params) => {
        const result = params.determineStatusAndRotate(sceneAComplete, [sceneBPending])
        capturedResult = result
        return { ...sceneAComplete, status: result.status }
      })

      await component.updateBundleAndRotateStates({
        bundleUpdate: {
          entityId: 'scene-a',
          platform: 'mac',
          isLods: false,
          status: Registry.SimplifiedStatus.COMPLETE
        }
      })

      // Scene A is COMPLETE (not FALLBACK — no longer returned by determineRegistryStatus)
      expect(capturedResult.status).toBe(Registry.Status.COMPLETE)
      // No older entities to mark as OBSOLETE
      expect(capturedResult.olderEntityIds).toEqual([])
      expect(capturedResult.fallbackUpdate).toBeNull()
    })

    it('should not rotate other entities when the newer scene fails', async () => {
      const sceneA = withAssetStatus(
        createRelativeRegistry(-1000, Registry.Status.COMPLETE, 'scene-a'),
        Registry.SimplifiedStatus.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE
      )

      const sceneBFailed = withAssetStatus(
        createRelativeRegistry(0, Registry.Status.PENDING, 'scene-b'),
        Registry.SimplifiedStatus.FAILED,
        Registry.SimplifiedStatus.COMPLETE
      )

      let capturedResult: any = null
      db.persistRegistryInTransaction.mockImplementation(async (params) => {
        const result = params.determineStatusAndRotate(sceneBFailed, [sceneA])
        capturedResult = result
        return { ...sceneBFailed, status: result.status }
      })

      await component.updateBundleAndRotateStates({
        bundleUpdate: {
          entityId: 'scene-b',
          platform: 'mac',
          isLods: false,
          status: Registry.SimplifiedStatus.FAILED
        }
      })

      // Scene B is FAILED, and no rotation happens — scene A is untouched
      expect(capturedResult.status).toBe(Registry.Status.FAILED)
      expect(capturedResult.olderEntityIds).toEqual([])
      expect(capturedResult.fallbackUpdate).toBeNull()
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
