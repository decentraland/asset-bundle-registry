import { Registry } from '../../src/types'
import { createRegistryEntity, getIdentity, Identity } from '../utils'
import { test } from '../components'

test('undeployRegistries', async ({ components }) => {
  let identity: Identity
  const registriesToCleanUp: Record<string, string[]> = {
    historical: [],
    current: []
  }

  beforeAll(async () => {
    identity = await getIdentity()
  })

  afterEach(async () => {
    if (registriesToCleanUp.current.length > 0) {
      await components.db.deleteRegistries(registriesToCleanUp.current)
      registriesToCleanUp.current = []
    }

    if (registriesToCleanUp.historical.length > 0) {
      await components.extendedDb.deleteHistoricalRegistries(registriesToCleanUp.historical)
      registriesToCleanUp.historical = []
    }
  })

  afterAll(async () => {
    await components.extendedDb.close()
  })

  const createRegistryOnDatabase = async (registry: Registry.DbEntity): Promise<void> => {
    await components.extendedDb.insertRegistry(registry)
    registriesToCleanUp.current.push(registry.id)
  }

  describe('when undeploying entities', () => {
    describe('and the entity exists with COMPLETE status', () => {
      let registry: Registry.DbEntity

      beforeEach(async () => {
        registry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          { id: 'entity-to-undeploy-1', pointers: ['world1.dcl.eth:0,0'] }
        )
        await createRegistryOnDatabase(registry)
      })

      it('should mark the entity as OBSOLETE', async () => {
        const updatedCount = await components.db.undeployRegistries([registry.id])

        expect(updatedCount).toBe(1)

        const updatedRegistry = await components.db.getRegistryById(registry.id)
        expect(updatedRegistry.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and the entity exists with PENDING status', () => {
      let registry: Registry.DbEntity

      beforeEach(async () => {
        registry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.PENDING,
          Registry.SimplifiedStatus.PENDING,
          { id: 'entity-to-undeploy-2', pointers: ['world2.dcl.eth:0,0'] }
        )
        await createRegistryOnDatabase(registry)
      })

      it('should mark the entity as OBSOLETE', async () => {
        const updatedCount = await components.db.undeployRegistries([registry.id])

        expect(updatedCount).toBe(1)

        const updatedRegistry = await components.db.getRegistryById(registry.id)
        expect(updatedRegistry.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and the entity does not exist', () => {
      it('should return 0 updated count', async () => {
        const updatedCount = await components.db.undeployRegistries(['non-existent-entity-id'])

        expect(updatedCount).toBe(0)
      })
    })

    describe('and an empty array is provided', () => {
      it('should return 0 updated count', async () => {
        const updatedCount = await components.db.undeployRegistries([])

        expect(updatedCount).toBe(0)
      })
    })

    describe('and multiple entities are provided', () => {
      let registry1: Registry.DbEntity
      let registry2: Registry.DbEntity

      beforeEach(async () => {
        registry1 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          { id: 'entity-to-undeploy-3', pointers: ['world3.dcl.eth:0,0'] }
        )
        registry2 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          { id: 'entity-to-undeploy-4', pointers: ['world4.dcl.eth:0,0'] }
        )
        await createRegistryOnDatabase(registry1)
        await createRegistryOnDatabase(registry2)
      })

      it('should mark all entities as OBSOLETE', async () => {
        const updatedCount = await components.db.undeployRegistries([registry1.id, registry2.id])

        expect(updatedCount).toBe(2)

        const updatedRegistry1 = await components.db.getRegistryById(registry1.id)
        const updatedRegistry2 = await components.db.getRegistryById(registry2.id)

        expect(updatedRegistry1.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedRegistry2.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and the entity has a fallback sharing the same pointers', () => {
      let targetRegistry: Registry.DbEntity
      let fallbackRegistry: Registry.DbEntity

      beforeEach(async () => {
        const sharedPointer = 'world5.dcl.eth:0,0'

        fallbackRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.FALLBACK,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'fallback-entity-5',
            pointers: [sharedPointer],
            timestamp: 1000
          }
        )
        targetRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'entity-to-undeploy-5',
            pointers: [sharedPointer],
            timestamp: 2000
          }
        )

        await createRegistryOnDatabase(fallbackRegistry)
        await createRegistryOnDatabase(targetRegistry)
      })

      it('should mark both the target entity and the fallback as OBSOLETE', async () => {
        const updatedCount = await components.db.undeployRegistries([targetRegistry.id])

        expect(updatedCount).toBe(2)

        const updatedTarget = await components.db.getRegistryById(targetRegistry.id)
        const updatedFallback = await components.db.getRegistryById(fallbackRegistry.id)

        expect(updatedTarget.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedFallback.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and multiple entities share pointers with the same fallback', () => {
      let targetRegistry1: Registry.DbEntity
      let targetRegistry2: Registry.DbEntity
      let fallbackRegistry: Registry.DbEntity

      beforeEach(async () => {
        const sharedPointer = 'world6.dcl.eth:0,0'

        fallbackRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.FALLBACK,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'fallback-entity-6',
            pointers: [sharedPointer],
            timestamp: 1000
          }
        )
        targetRegistry1 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.PENDING,
          Registry.SimplifiedStatus.PENDING,
          {
            id: 'entity-to-undeploy-6a',
            pointers: [sharedPointer],
            timestamp: 2000
          }
        )
        targetRegistry2 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'entity-to-undeploy-6b',
            pointers: [sharedPointer],
            timestamp: 3000
          }
        )

        await createRegistryOnDatabase(fallbackRegistry)
        await createRegistryOnDatabase(targetRegistry1)
        await createRegistryOnDatabase(targetRegistry2)
      })

      it('should mark all target entities and the fallback as OBSOLETE', async () => {
        const updatedCount = await components.db.undeployRegistries([targetRegistry1.id, targetRegistry2.id])

        expect(updatedCount).toBe(3)

        const updatedTarget1 = await components.db.getRegistryById(targetRegistry1.id)
        const updatedTarget2 = await components.db.getRegistryById(targetRegistry2.id)
        const updatedFallback = await components.db.getRegistryById(fallbackRegistry.id)

        expect(updatedTarget1.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedTarget2.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedFallback.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and the entity has multiple pointers with multiple fallbacks', () => {
      let targetRegistry: Registry.DbEntity
      let fallbackRegistry1: Registry.DbEntity
      let fallbackRegistry2: Registry.DbEntity

      beforeEach(async () => {
        const pointer1 = 'world7.dcl.eth:0,0'
        const pointer2 = 'world7.dcl.eth:1,0'

        fallbackRegistry1 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.FALLBACK,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'fallback-entity-7a',
            pointers: [pointer1],
            timestamp: 1000
          }
        )
        fallbackRegistry2 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.FALLBACK,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'fallback-entity-7b',
            pointers: [pointer2],
            timestamp: 1500
          }
        )
        targetRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'entity-to-undeploy-7',
            pointers: [pointer1, pointer2],
            timestamp: 2000
          }
        )

        await createRegistryOnDatabase(fallbackRegistry1)
        await createRegistryOnDatabase(fallbackRegistry2)
        await createRegistryOnDatabase(targetRegistry)
      })

      it('should mark the target entity and all fallbacks as OBSOLETE', async () => {
        const updatedCount = await components.db.undeployRegistries([targetRegistry.id])

        expect(updatedCount).toBe(3)

        const updatedTarget = await components.db.getRegistryById(targetRegistry.id)
        const updatedFallback1 = await components.db.getRegistryById(fallbackRegistry1.id)
        const updatedFallback2 = await components.db.getRegistryById(fallbackRegistry2.id)

        expect(updatedTarget.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedFallback1.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedFallback2.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and there are unrelated registries with different pointers', () => {
      let targetRegistry: Registry.DbEntity
      let unrelatedRegistry: Registry.DbEntity

      beforeEach(async () => {
        targetRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'entity-to-undeploy-8',
            pointers: ['world8.dcl.eth:0,0']
          }
        )
        unrelatedRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'unrelated-entity-8',
            pointers: ['different-world.dcl.eth:0,0']
          }
        )

        await createRegistryOnDatabase(targetRegistry)
        await createRegistryOnDatabase(unrelatedRegistry)
      })

      it('should only mark the target entity as OBSOLETE', async () => {
        const updatedCount = await components.db.undeployRegistries([targetRegistry.id])

        expect(updatedCount).toBe(1)

        const updatedTarget = await components.db.getRegistryById(targetRegistry.id)
        const unchangedUnrelated = await components.db.getRegistryById(unrelatedRegistry.id)

        expect(updatedTarget.status).toBe(Registry.Status.OBSOLETE)
        expect(unchangedUnrelated.status).toBe(Registry.Status.COMPLETE)
      })
    })

    describe('and there is a COMPLETE registry sharing pointers (not FALLBACK)', () => {
      let targetRegistry: Registry.DbEntity
      let completeRegistry: Registry.DbEntity

      beforeEach(async () => {
        const sharedPointer = 'world9.dcl.eth:0,0'

        completeRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'complete-entity-9',
            pointers: [sharedPointer],
            timestamp: 1000
          }
        )
        targetRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'entity-to-undeploy-9',
            pointers: [sharedPointer],
            timestamp: 2000
          }
        )

        await createRegistryOnDatabase(completeRegistry)
        await createRegistryOnDatabase(targetRegistry)
      })

      it('should only mark the target entity as OBSOLETE (not COMPLETE registries)', async () => {
        const updatedCount = await components.db.undeployRegistries([targetRegistry.id])

        expect(updatedCount).toBe(1)

        const updatedTarget = await components.db.getRegistryById(targetRegistry.id)
        const unchangedComplete = await components.db.getRegistryById(completeRegistry.id)

        expect(updatedTarget.status).toBe(Registry.Status.OBSOLETE)
        expect(unchangedComplete.status).toBe(Registry.Status.COMPLETE)
      })
    })

    describe('and the entity ID has different casing', () => {
      let registry: Registry.DbEntity

      beforeEach(async () => {
        registry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          { id: 'Entity-To-Undeploy-10', pointers: ['world10.dcl.eth:0,0'] }
        )
        await createRegistryOnDatabase(registry)
      })

      it('should mark the entity as OBSOLETE regardless of casing', async () => {
        const updatedCount = await components.db.undeployRegistries(['ENTITY-TO-UNDEPLOY-10'])

        expect(updatedCount).toBe(1)

        const updatedRegistry = await components.db.getRegistryById(registry.id)
        expect(updatedRegistry.status).toBe(Registry.Status.OBSOLETE)
      })
    })
  })
})
