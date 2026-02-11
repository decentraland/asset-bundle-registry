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

  describe('when undeploying world scenes', () => {
    describe('and an empty array is provided', () => {
      it('should return 0 count and null world name', async () => {
        const result = await components.db.undeployWorldScenes([])

        expect(result.undeployedCount).toBe(0)
        expect(result.worldName).toBeNull()
      })
    })

    describe('and the entity IDs do not exist in the database', () => {
      it('should return 0 count and null world name', async () => {
        const result = await components.db.undeployWorldScenes(['non-existent-entity-1', 'non-existent-entity-2'])

        expect(result.undeployedCount).toBe(0)
        expect(result.worldName).toBeNull()
      })
    })

    describe('and a single world entity exists', () => {
      let registry: Registry.DbEntity

      beforeEach(async () => {
        registry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-scene-undeploy-1',
            type: 'world',
            pointers: ['scenes-world1.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'scenes-world1.dcl.eth'
              }
            }
          }
        )
        await createRegistryOnDatabase(registry)
      })

      it('should mark it as OBSOLETE and return the world name', async () => {
        const result = await components.db.undeployWorldScenes([registry.id])

        expect(result.undeployedCount).toBe(1)
        expect(result.worldName).toBe('scenes-world1.dcl.eth')

        const updatedRegistry = await components.db.getRegistryById(registry.id)
        expect(updatedRegistry.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and multiple entities from the same world are provided', () => {
      let registry1: Registry.DbEntity
      let registry2: Registry.DbEntity

      beforeEach(async () => {
        registry1 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-scene-undeploy-2a',
            type: 'world',
            pointers: ['scenes-world2.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'scenes-world2.dcl.eth'
              }
            },
            timestamp: 1000
          }
        )
        registry2 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-scene-undeploy-2b',
            type: 'world',
            pointers: ['scenes-world2.dcl.eth:1,0'],
            metadata: {
              worldConfiguration: {
                name: 'scenes-world2.dcl.eth'
              }
            },
            timestamp: 2000
          }
        )
        await createRegistryOnDatabase(registry1)
        await createRegistryOnDatabase(registry2)
      })

      it('should mark all as OBSOLETE and return the world name', async () => {
        const result = await components.db.undeployWorldScenes([registry1.id, registry2.id])

        expect(result.undeployedCount).toBe(2)
        expect(result.worldName).toBe('scenes-world2.dcl.eth')

        const updatedRegistry1 = await components.db.getRegistryById(registry1.id)
        const updatedRegistry2 = await components.db.getRegistryById(registry2.id)

        expect(updatedRegistry1.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedRegistry2.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and the entity has no worldConfiguration in metadata', () => {
      let registry: Registry.DbEntity

      beforeEach(async () => {
        registry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-scene-undeploy-3',
            pointers: ['scenes-world3.dcl.eth:0,0']
          }
        )
        await createRegistryOnDatabase(registry)
      })

      it('should mark the entity as OBSOLETE and return null world name', async () => {
        const result = await components.db.undeployWorldScenes([registry.id])

        expect(result.undeployedCount).toBe(1)
        expect(result.worldName).toBeNull()

        const updatedRegistry = await components.db.getRegistryById(registry.id)
        expect(updatedRegistry.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and the entity has a fallback sharing pointers', () => {
      let targetRegistry: Registry.DbEntity
      let fallbackRegistry: Registry.DbEntity

      beforeEach(async () => {
        const sharedPointer = 'scenes-world4.dcl.eth:0,0'

        fallbackRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.FALLBACK,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-scene-fallback-4',
            type: 'world',
            pointers: [sharedPointer],
            metadata: {
              worldConfiguration: {
                name: 'scenes-world4.dcl.eth'
              }
            },
            timestamp: 1000
          }
        )
        targetRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-scene-undeploy-4',
            type: 'world',
            pointers: [sharedPointer],
            metadata: {
              worldConfiguration: {
                name: 'scenes-world4.dcl.eth'
              }
            },
            timestamp: 2000
          }
        )

        await createRegistryOnDatabase(fallbackRegistry)
        await createRegistryOnDatabase(targetRegistry)
      })

      it('should mark both the target and the fallback as OBSOLETE', async () => {
        const result = await components.db.undeployWorldScenes([targetRegistry.id])

        expect(result.undeployedCount).toBe(2)
        expect(result.worldName).toBe('scenes-world4.dcl.eth')

        const updatedTarget = await components.db.getRegistryById(targetRegistry.id)
        const updatedFallback = await components.db.getRegistryById(fallbackRegistry.id)

        expect(updatedTarget.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedFallback.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and unrelated registries from a different world exist', () => {
      let targetRegistry: Registry.DbEntity
      let unrelatedRegistry: Registry.DbEntity

      beforeEach(async () => {
        targetRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-scene-undeploy-5',
            type: 'world',
            pointers: ['scenes-world5.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'scenes-world5.dcl.eth'
              }
            }
          }
        )
        unrelatedRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-scene-unrelated-5',
            type: 'world',
            pointers: ['scenes-other-world5.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'scenes-other-world5.dcl.eth'
              }
            }
          }
        )

        await createRegistryOnDatabase(targetRegistry)
        await createRegistryOnDatabase(unrelatedRegistry)
      })

      it('should only mark the target entity as OBSOLETE', async () => {
        const result = await components.db.undeployWorldScenes([targetRegistry.id])

        expect(result.undeployedCount).toBe(1)
        expect(result.worldName).toBe('scenes-world5.dcl.eth')

        const updatedTarget = await components.db.getRegistryById(targetRegistry.id)
        const unchangedUnrelated = await components.db.getRegistryById(unrelatedRegistry.id)

        expect(updatedTarget.status).toBe(Registry.Status.OBSOLETE)
        expect(unchangedUnrelated.status).toBe(Registry.Status.COMPLETE)
      })
    })
  })

  describe('when undeploying a world by name', () => {
    describe('and the world has no registries', () => {
      it('should return 0 count and the normalized world name', async () => {
        const result = await components.db.undeployWorldByName('non-existent-world.dcl.eth')

        expect(result.undeployedCount).toBe(0)
        expect(result.worldName).toBe('non-existent-world.dcl.eth')
      })
    })

    describe('and the world has a single registry', () => {
      let registry: Registry.DbEntity

      beforeEach(async () => {
        registry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-undeploy-1',
            type: 'world',
            pointers: ['byname-world1.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'byname-world1.dcl.eth'
              }
            }
          }
        )
        await createRegistryOnDatabase(registry)
      })

      it('should mark it as OBSOLETE and return the count and world name', async () => {
        const result = await components.db.undeployWorldByName('byname-world1.dcl.eth')

        expect(result.undeployedCount).toBe(1)
        expect(result.worldName).toBe('byname-world1.dcl.eth')

        const updatedRegistry = await components.db.getRegistryById(registry.id)
        expect(updatedRegistry.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and the world has multiple registries', () => {
      let registry1: Registry.DbEntity
      let registry2: Registry.DbEntity
      let registry3: Registry.DbEntity

      beforeEach(async () => {
        registry1 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-undeploy-2a',
            type: 'world',
            pointers: ['byname-world2.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'byname-world2.dcl.eth'
              }
            },
            timestamp: 1000
          }
        )
        registry2 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-undeploy-2b',
            type: 'world',
            pointers: ['byname-world2.dcl.eth:1,0'],
            metadata: {
              worldConfiguration: {
                name: 'byname-world2.dcl.eth'
              }
            },
            timestamp: 2000
          }
        )
        registry3 = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.PENDING,
          Registry.SimplifiedStatus.PENDING,
          {
            id: 'world-byname-undeploy-2c',
            type: 'world',
            pointers: ['byname-world2.dcl.eth:2,0'],
            metadata: {
              worldConfiguration: {
                name: 'byname-world2.dcl.eth'
              }
            },
            timestamp: 3000
          }
        )
        await createRegistryOnDatabase(registry1)
        await createRegistryOnDatabase(registry2)
        await createRegistryOnDatabase(registry3)
      })

      it('should mark all registries as OBSOLETE', async () => {
        const result = await components.db.undeployWorldByName('byname-world2.dcl.eth')

        expect(result.undeployedCount).toBe(3)
        expect(result.worldName).toBe('byname-world2.dcl.eth')

        const updatedRegistry1 = await components.db.getRegistryById(registry1.id)
        const updatedRegistry2 = await components.db.getRegistryById(registry2.id)
        const updatedRegistry3 = await components.db.getRegistryById(registry3.id)

        expect(updatedRegistry1.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedRegistry2.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedRegistry3.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and the world has already-OBSOLETE registries alongside active ones', () => {
      let activeRegistry: Registry.DbEntity
      let obsoleteRegistry: Registry.DbEntity

      beforeEach(async () => {
        activeRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-undeploy-3a',
            type: 'world',
            pointers: ['byname-world3.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'byname-world3.dcl.eth'
              }
            },
            timestamp: 2000
          }
        )
        obsoleteRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.OBSOLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-undeploy-3b',
            type: 'world',
            pointers: ['byname-world3.dcl.eth:1,0'],
            metadata: {
              worldConfiguration: {
                name: 'byname-world3.dcl.eth'
              }
            },
            timestamp: 1000
          }
        )
        await createRegistryOnDatabase(activeRegistry)
        await createRegistryOnDatabase(obsoleteRegistry)
      })

      it('should only undeploy the non-OBSOLETE registries', async () => {
        const result = await components.db.undeployWorldByName('byname-world3.dcl.eth')

        expect(result.undeployedCount).toBe(1)
        expect(result.worldName).toBe('byname-world3.dcl.eth')

        const updatedActive = await components.db.getRegistryById(activeRegistry.id)
        const unchangedObsolete = await components.db.getRegistryById(obsoleteRegistry.id)

        expect(updatedActive.status).toBe(Registry.Status.OBSOLETE)
        expect(unchangedObsolete.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and the world has registries with a fallback sharing pointers', () => {
      let targetRegistry: Registry.DbEntity
      let fallbackRegistry: Registry.DbEntity

      beforeEach(async () => {
        const sharedPointer = 'byname-world4.dcl.eth:0,0'

        fallbackRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.FALLBACK,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-fallback-4',
            type: 'world',
            pointers: [sharedPointer],
            metadata: {
              worldConfiguration: {
                name: 'byname-world4.dcl.eth'
              }
            },
            timestamp: 1000
          }
        )
        targetRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-undeploy-4',
            type: 'world',
            pointers: [sharedPointer],
            metadata: {
              worldConfiguration: {
                name: 'byname-world4.dcl.eth'
              }
            },
            timestamp: 2000
          }
        )

        await createRegistryOnDatabase(fallbackRegistry)
        await createRegistryOnDatabase(targetRegistry)
      })

      it('should mark both the target and the fallback as OBSOLETE', async () => {
        const result = await components.db.undeployWorldByName('byname-world4.dcl.eth')

        expect(result.undeployedCount).toBe(2)
        expect(result.worldName).toBe('byname-world4.dcl.eth')

        const updatedTarget = await components.db.getRegistryById(targetRegistry.id)
        const updatedFallback = await components.db.getRegistryById(fallbackRegistry.id)

        expect(updatedTarget.status).toBe(Registry.Status.OBSOLETE)
        expect(updatedFallback.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and the world name has different casing', () => {
      let registry: Registry.DbEntity

      beforeEach(async () => {
        registry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-undeploy-5',
            type: 'world',
            pointers: ['byname-world5.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'Byname-World5.dcl.eth'
              }
            }
          }
        )
        await createRegistryOnDatabase(registry)
      })

      it('should find and undeploy the registries regardless of casing', async () => {
        const result = await components.db.undeployWorldByName('BYNAME-WORLD5.DCL.ETH')

        expect(result.undeployedCount).toBe(1)
        expect(result.worldName).toBe('byname-world5.dcl.eth')

        const updatedRegistry = await components.db.getRegistryById(registry.id)
        expect(updatedRegistry.status).toBe(Registry.Status.OBSOLETE)
      })
    })

    describe('and unrelated registries from a different world exist', () => {
      let targetRegistry: Registry.DbEntity
      let unrelatedRegistry: Registry.DbEntity

      beforeEach(async () => {
        targetRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-undeploy-6',
            type: 'world',
            pointers: ['byname-world6.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'byname-world6.dcl.eth'
              }
            }
          }
        )
        unrelatedRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-unrelated-6',
            type: 'world',
            pointers: ['byname-other-world6.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'byname-other-world6.dcl.eth'
              }
            }
          }
        )

        await createRegistryOnDatabase(targetRegistry)
        await createRegistryOnDatabase(unrelatedRegistry)
      })

      it('should only undeploy registries belonging to the specified world', async () => {
        const result = await components.db.undeployWorldByName('byname-world6.dcl.eth')

        expect(result.undeployedCount).toBe(1)
        expect(result.worldName).toBe('byname-world6.dcl.eth')

        const updatedTarget = await components.db.getRegistryById(targetRegistry.id)
        const unchangedUnrelated = await components.db.getRegistryById(unrelatedRegistry.id)

        expect(updatedTarget.status).toBe(Registry.Status.OBSOLETE)
        expect(unchangedUnrelated.status).toBe(Registry.Status.COMPLETE)
      })
    })

    describe('and all registries are already OBSOLETE', () => {
      let obsoleteRegistry: Registry.DbEntity

      beforeEach(async () => {
        obsoleteRegistry = createRegistryEntity(
          identity.realAccount.address,
          Registry.Status.OBSOLETE,
          Registry.SimplifiedStatus.COMPLETE,
          {
            id: 'world-byname-undeploy-7',
            type: 'world',
            pointers: ['byname-world7.dcl.eth:0,0'],
            metadata: {
              worldConfiguration: {
                name: 'byname-world7.dcl.eth'
              }
            }
          }
        )
        await createRegistryOnDatabase(obsoleteRegistry)
      })

      it('should return 0 count since no non-OBSOLETE registries exist', async () => {
        const result = await components.db.undeployWorldByName('byname-world7.dcl.eth')

        expect(result.undeployedCount).toBe(0)
        expect(result.worldName).toBe('byname-world7.dcl.eth')
      })
    })
  })
})
