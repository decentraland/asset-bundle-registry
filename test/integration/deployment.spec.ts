import { Entity, EntityType } from '@dcl/schemas'
import { AuthLinkType } from '@dcl/crypto'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { Registry } from '../../src/types'
import { getIdentity, Identity } from '../utils'
import { test } from '../components'

/**
 * Integration tests for deployment message handling via the message processor.
 *
 * These tests verify the full deployment flow: message processor receives a DeploymentToSqs event,
 * the deployment handler fetches the entity (from mocked catalyst/worlds), and the registry
 * component persists it with the correct status while rotating related registries.
 */
test('deployment message handling', async ({ components, spyComponents }) => {
  let identity: Identity
  const registriesToCleanUp: string[] = []

  beforeAll(async () => {
    identity = await getIdentity()
  })

  afterEach(async () => {
    if (registriesToCleanUp.length > 0) {
      await components.db.deleteRegistries(registriesToCleanUp)
      registriesToCleanUp.length = 0
    }
  })

  afterAll(async () => {
    await components.extendedDb.close()
  })

  /**
   * Helper to create a DeploymentToSqs message
   */
  const createDeploymentMessage = (entityId: string, contentServerUrls?: string[]): DeploymentToSqs => ({
    entity: {
      entityId,
      authChain: [
        {
          type: AuthLinkType.SIGNER,
          payload: identity.realAccount.address,
          signature: ''
        }
      ]
    },
    contentServerUrls
  })

  /**
   * Helper to create an Entity as returned by the catalyst or worlds adapter
   */
  const createEntity = (overrides: Partial<Entity> = {}): Entity => ({
    id: 'default-entity-id',
    version: '1',
    type: EntityType.SCENE,
    pointers: ['0,0'],
    timestamp: Date.now(),
    content: [],
    metadata: {},
    ...overrides
  })

  /**
   * Helper to set up spies for a Genesis City deployment.
   * Uses spyComponents to spy on the real catalyst and worlds (shared with the message processor).
   */
  const mockGenesisCityDeployment = (entity: Entity): void => {
    spyComponents.worlds.isWorldDeployment.mockReturnValue(false)
    spyComponents.catalyst.getEntityById.mockResolvedValue(entity)
  }

  /**
   * Helper to set up spies for a world deployment
   */
  const mockWorldDeployment = (entity: Entity): void => {
    spyComponents.worlds.isWorldDeployment.mockReturnValue(true)
    spyComponents.worlds.getWorld.mockResolvedValue(entity)
  }

  describe('when a Genesis City scene deployment message is processed', () => {
    describe('and the pointers are not occupied by any other scene', () => {
      let entityId: string

      beforeEach(async () => {
        entityId = `genesis-empty-${Date.now()}`
        const entity = createEntity({ id: entityId, pointers: ['500,500'], timestamp: 1000 })
        mockGenesisCityDeployment(entity)

        const message = createDeploymentMessage(entityId)
        registriesToCleanUp.push(entityId)
        await components.messageProcessor.process(message)
      })

      it('should persist the registry with pending status', async () => {
        const registry = await components.db.getRegistryById(entityId)

        expect(registry).not.toBeNull()
        expect(registry!.status).toBe(Registry.Status.PENDING)
        expect(registry!.pointers).toEqual(['500,500'])
      })
    })

    describe('and there is an older scene at the same pointers', () => {
      let olderEntityId: string
      let newerEntityId: string

      beforeEach(async () => {
        olderEntityId = `genesis-older-${Date.now()}`
        newerEntityId = `genesis-newer-${Date.now()}`

        // First, deploy the older scene
        const olderEntity = createEntity({ id: olderEntityId, pointers: ['600,600'], timestamp: 1000 })
        mockGenesisCityDeployment(olderEntity)
        registriesToCleanUp.push(olderEntityId)
        await components.messageProcessor.process(createDeploymentMessage(olderEntityId))

        // Then, deploy the newer scene at the same pointers
        const newerEntity = createEntity({ id: newerEntityId, pointers: ['600,600'], timestamp: 2000 })
        mockGenesisCityDeployment(newerEntity)
        registriesToCleanUp.push(newerEntityId)
        await components.messageProcessor.process(createDeploymentMessage(newerEntityId))
      })

      it('should mark the older registry as obsolete', async () => {
        const olderRegistry = await components.db.getRegistryById(olderEntityId)

        expect(olderRegistry).not.toBeNull()
        expect(olderRegistry!.status).toBe(Registry.Status.OBSOLETE)
      })

      it('should persist the newer registry with pending status', async () => {
        const newerRegistry = await components.db.getRegistryById(newerEntityId)

        expect(newerRegistry).not.toBeNull()
        expect(newerRegistry!.status).toBe(Registry.Status.PENDING)
      })
    })

    describe('and there is a newer scene already at the same pointers', () => {
      let olderEntityId: string
      let newerEntityId: string

      beforeEach(async () => {
        olderEntityId = `genesis-late-older-${Date.now()}`
        newerEntityId = `genesis-late-newer-${Date.now()}`

        // First, the newer scene arrives and gets deployed
        const newerEntity = createEntity({ id: newerEntityId, pointers: ['700,700'], timestamp: 2000 })
        mockGenesisCityDeployment(newerEntity)
        registriesToCleanUp.push(newerEntityId)
        await components.messageProcessor.process(createDeploymentMessage(newerEntityId))

        // Then, the older scene arrives late
        const olderEntity = createEntity({ id: olderEntityId, pointers: ['700,700'], timestamp: 1000 })
        mockGenesisCityDeployment(olderEntity)
        registriesToCleanUp.push(olderEntityId)
        await components.messageProcessor.process(createDeploymentMessage(olderEntityId))
      })

      it('should persist the older registry with pending status since the newer one is also pending', async () => {
        const olderRegistry = await components.db.getRegistryById(olderEntityId)

        expect(olderRegistry).not.toBeNull()
        expect(olderRegistry!.status).toBe(Registry.Status.PENDING)
      })

      it('should keep the newer registry with pending status', async () => {
        const newerRegistry = await components.db.getRegistryById(newerEntityId)

        expect(newerRegistry).not.toBeNull()
        expect(newerRegistry!.status).toBe(Registry.Status.PENDING)
      })
    })

    describe('and the same entity ID has already been deployed', () => {
      let entityId: string

      beforeEach(async () => {
        entityId = `genesis-duplicate-${Date.now()}`
        const entity = createEntity({ id: entityId, pointers: ['800,800'], timestamp: 1000 })
        mockGenesisCityDeployment(entity)

        const message = createDeploymentMessage(entityId)
        registriesToCleanUp.push(entityId)
        await components.messageProcessor.process(message)

        // Re-spy and process the same message again
        mockGenesisCityDeployment(entity)
        await components.messageProcessor.process(message)
      })

      it('should not create a duplicate registry', async () => {
        const registry = await components.db.getRegistryById(entityId)

        expect(registry).not.toBeNull()
        expect(registry!.status).toBe(Registry.Status.PENDING)
      })

      it('should not call the catalyst to fetch the entity again', () => {
        expect(spyComponents.catalyst.getEntityById).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('when a world scene deployment message is processed', () => {
    const worldContentServerUrl = 'https://worlds-content-server.decentraland.org/world'

    describe('and the pointers are not occupied by any other scene in the same world', () => {
      let entityId: string

      beforeEach(async () => {
        entityId = `world-empty-${Date.now()}`
        const entity = createEntity({
          id: entityId,
          type: 'world' as any,
          pointers: ['0,0', '1,0'],
          timestamp: 1000,
          metadata: {
            worldConfiguration: { name: 'test-world-empty.dcl.eth' },
            scene: { parcels: ['0,0', '1,0'], base: '0,0' }
          }
        })
        mockWorldDeployment(entity)

        const message = createDeploymentMessage(entityId, [worldContentServerUrl])
        registriesToCleanUp.push(entityId)
        await components.messageProcessor.process(message)
      })

      it('should persist the registry with pending status', async () => {
        const registry = await components.db.getRegistryById(entityId)

        expect(registry).not.toBeNull()
        expect(registry!.status).toBe(Registry.Status.PENDING)
        expect(registry!.pointers).toEqual(['0,0', '1,0'])
      })
    })

    describe('and there is an older scene at the same pointers in the same world', () => {
      let olderEntityId: string
      let newerEntityId: string
      const worldName = 'test-world-conflict.dcl.eth'

      beforeEach(async () => {
        olderEntityId = `world-older-${Date.now()}`
        newerEntityId = `world-newer-${Date.now()}`

        // Deploy the older world scene
        const olderEntity = createEntity({
          id: olderEntityId,
          type: 'world' as any,
          pointers: ['0,0', '1,0'],
          timestamp: 1000,
          metadata: {
            worldConfiguration: { name: worldName },
            scene: { parcels: ['0,0', '1,0'], base: '0,0' }
          }
        })
        mockWorldDeployment(olderEntity)
        registriesToCleanUp.push(olderEntityId)
        await components.messageProcessor.process(createDeploymentMessage(olderEntityId, [worldContentServerUrl]))

        // Deploy the newer world scene at the same pointers in the same world
        const newerEntity = createEntity({
          id: newerEntityId,
          type: 'world' as any,
          pointers: ['0,0', '1,0'],
          timestamp: 2000,
          metadata: {
            worldConfiguration: { name: worldName },
            scene: { parcels: ['0,0', '1,0'], base: '0,0' }
          }
        })
        mockWorldDeployment(newerEntity)
        registriesToCleanUp.push(newerEntityId)
        await components.messageProcessor.process(createDeploymentMessage(newerEntityId, [worldContentServerUrl]))
      })

      it('should mark the older registry as obsolete', async () => {
        const olderRegistry = await components.db.getRegistryById(olderEntityId)

        expect(olderRegistry).not.toBeNull()
        expect(olderRegistry!.status).toBe(Registry.Status.OBSOLETE)
      })

      it('should persist the newer registry with pending status', async () => {
        const newerRegistry = await components.db.getRegistryById(newerEntityId)

        expect(newerRegistry).not.toBeNull()
        expect(newerRegistry!.status).toBe(Registry.Status.PENDING)
      })
    })

    describe('and there is a scene at the same pointers in a different world', () => {
      let worldAEntityId: string
      let worldBEntityId: string

      beforeEach(async () => {
        worldAEntityId = `world-a-${Date.now()}`
        worldBEntityId = `world-b-${Date.now()}`

        // Deploy scene in world A
        const worldAEntity = createEntity({
          id: worldAEntityId,
          type: 'world' as any,
          pointers: ['0,0', '1,0'],
          timestamp: 1000,
          metadata: {
            worldConfiguration: { name: 'world-a.dcl.eth' },
            scene: { parcels: ['0,0', '1,0'], base: '0,0' }
          }
        })
        mockWorldDeployment(worldAEntity)
        registriesToCleanUp.push(worldAEntityId)
        await components.messageProcessor.process(createDeploymentMessage(worldAEntityId, [worldContentServerUrl]))

        // Deploy scene in world B at the same pointers
        const worldBEntity = createEntity({
          id: worldBEntityId,
          type: 'world' as any,
          pointers: ['0,0', '1,0'],
          timestamp: 2000,
          metadata: {
            worldConfiguration: { name: 'world-b.dcl.eth' },
            scene: { parcels: ['0,0', '1,0'], base: '0,0' }
          }
        })
        mockWorldDeployment(worldBEntity)
        registriesToCleanUp.push(worldBEntityId)
        await components.messageProcessor.process(createDeploymentMessage(worldBEntityId, [worldContentServerUrl]))
      })

      it('should not mark the world A registry as obsolete', async () => {
        const worldARegistry = await components.db.getRegistryById(worldAEntityId)

        expect(worldARegistry).not.toBeNull()
        expect(worldARegistry!.status).toBe(Registry.Status.PENDING)
      })

      it('should persist the world B registry with pending status', async () => {
        const worldBRegistry = await components.db.getRegistryById(worldBEntityId)

        expect(worldBRegistry).not.toBeNull()
        expect(worldBRegistry!.status).toBe(Registry.Status.PENDING)
      })
    })

    describe('and there is a Genesis City scene at the same pointers', () => {
      let genesisEntityId: string
      let worldEntityId: string

      beforeEach(async () => {
        genesisEntityId = `genesis-cross-${Date.now()}`
        worldEntityId = `world-cross-${Date.now()}`

        // Deploy a Genesis City scene
        const genesisEntity = createEntity({
          id: genesisEntityId,
          pointers: ['0,0'],
          timestamp: 1000,
          metadata: {}
        })
        mockGenesisCityDeployment(genesisEntity)
        registriesToCleanUp.push(genesisEntityId)
        await components.messageProcessor.process(createDeploymentMessage(genesisEntityId))

        // Deploy a world scene at the same pointers
        const worldEntity = createEntity({
          id: worldEntityId,
          type: 'world' as any,
          pointers: ['0,0'],
          timestamp: 2000,
          metadata: {
            worldConfiguration: { name: 'cross-world.dcl.eth' },
            scene: { parcels: ['0,0'], base: '0,0' }
          }
        })
        mockWorldDeployment(worldEntity)
        registriesToCleanUp.push(worldEntityId)
        await components.messageProcessor.process(createDeploymentMessage(worldEntityId, [worldContentServerUrl]))
      })

      it('should not mark the Genesis City registry as obsolete', async () => {
        const genesisRegistry = await components.db.getRegistryById(genesisEntityId)

        expect(genesisRegistry).not.toBeNull()
        expect(genesisRegistry!.status).toBe(Registry.Status.PENDING)
      })

      it('should persist the world registry with pending status', async () => {
        const worldRegistry = await components.db.getRegistryById(worldEntityId)

        expect(worldRegistry).not.toBeNull()
        expect(worldRegistry!.status).toBe(Registry.Status.PENDING)
      })
    })

    describe('and there is a world scene at the same pointers as a new Genesis City scene', () => {
      let worldEntityId: string
      let genesisEntityId: string

      beforeEach(async () => {
        worldEntityId = `world-before-genesis-${Date.now()}`
        genesisEntityId = `genesis-after-world-${Date.now()}`

        // Deploy a world scene first
        const worldEntity = createEntity({
          id: worldEntityId,
          type: 'world' as any,
          pointers: ['0,0'],
          timestamp: 1000,
          metadata: {
            worldConfiguration: { name: 'before-genesis-world.dcl.eth' },
            scene: { parcels: ['0,0'], base: '0,0' }
          }
        })
        mockWorldDeployment(worldEntity)
        registriesToCleanUp.push(worldEntityId)
        await components.messageProcessor.process(createDeploymentMessage(worldEntityId, [worldContentServerUrl]))

        // Deploy a Genesis City scene at the same pointers
        const genesisEntity = createEntity({
          id: genesisEntityId,
          pointers: ['0,0'],
          timestamp: 2000,
          metadata: {}
        })
        mockGenesisCityDeployment(genesisEntity)
        registriesToCleanUp.push(genesisEntityId)
        await components.messageProcessor.process(createDeploymentMessage(genesisEntityId))
      })

      it('should not mark the world registry as obsolete', async () => {
        const worldRegistry = await components.db.getRegistryById(worldEntityId)

        expect(worldRegistry).not.toBeNull()
        expect(worldRegistry!.status).toBe(Registry.Status.PENDING)
      })

      it('should persist the Genesis City registry with pending status', async () => {
        const genesisRegistry = await components.db.getRegistryById(genesisEntityId)

        expect(genesisRegistry).not.toBeNull()
        expect(genesisRegistry!.status).toBe(Registry.Status.PENDING)
      })
    })

    describe('and there are partially overlapping pointers in the same world', () => {
      let olderEntityId: string
      let newerEntityId: string
      const worldName = 'test-world-partial.dcl.eth'

      beforeEach(async () => {
        olderEntityId = `world-partial-older-${Date.now()}`
        newerEntityId = `world-partial-newer-${Date.now()}`

        // Deploy older scene covering pointers 0,0 and 1,0
        const olderEntity = createEntity({
          id: olderEntityId,
          type: 'world' as any,
          pointers: ['0,0', '1,0'],
          timestamp: 1000,
          metadata: {
            worldConfiguration: { name: worldName },
            scene: { parcels: ['0,0', '1,0'], base: '0,0' }
          }
        })
        mockWorldDeployment(olderEntity)
        registriesToCleanUp.push(olderEntityId)
        await components.messageProcessor.process(createDeploymentMessage(olderEntityId, [worldContentServerUrl]))

        // Deploy newer scene covering pointers 1,0 and 2,0 (overlap at 1,0)
        const newerEntity = createEntity({
          id: newerEntityId,
          type: 'world' as any,
          pointers: ['1,0', '2,0'],
          timestamp: 2000,
          metadata: {
            worldConfiguration: { name: worldName },
            scene: { parcels: ['1,0', '2,0'], base: '1,0' }
          }
        })
        mockWorldDeployment(newerEntity)
        registriesToCleanUp.push(newerEntityId)
        await components.messageProcessor.process(createDeploymentMessage(newerEntityId, [worldContentServerUrl]))
      })

      it('should mark the older registry as obsolete', async () => {
        const olderRegistry = await components.db.getRegistryById(olderEntityId)

        expect(olderRegistry).not.toBeNull()
        expect(olderRegistry!.status).toBe(Registry.Status.OBSOLETE)
      })

      it('should persist the newer registry with pending status', async () => {
        const newerRegistry = await components.db.getRegistryById(newerEntityId)

        expect(newerRegistry).not.toBeNull()
        expect(newerRegistry!.status).toBe(Registry.Status.PENDING)
      })
    })
  })

  describe('when the entity is not found', () => {
    let entityId: string

    beforeEach(() => {
      entityId = `not-found-entity-${Date.now()}`
      spyComponents.worlds.isWorldDeployment.mockReturnValue(false)
      spyComponents.catalyst.getEntityById.mockResolvedValue(null)
    })

    it('should not persist any registry', async () => {
      const message = createDeploymentMessage(entityId)
      await components.messageProcessor.process(message)

      const registry = await components.db.getRegistryById(entityId)

      expect(registry).toBeNull()
    })
  })
})
