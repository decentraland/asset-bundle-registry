import { AssetBundleConversionFinishedEvent, Entity, EntityType, Events } from '@dcl/schemas'
import { AuthLinkType } from '@dcl/crypto'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { Registry } from '../../src/types'
import { ManifestStatusCode } from '../../src/logic/entity-status-fetcher'
import { getIdentity, Identity } from '../utils'
import { test } from '../components'

/**
 * Integration tests for texture conversion event handling.
 *
 * These tests verify the full flow: deployment → texture conversion events → status rotation,
 * including the atomic transaction that prevents race conditions from concurrent texture events.
 */
test('texture conversion handling', async ({ components, spyComponents }) => {
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

  const createTextureEvent = (
    entityId: string,
    platform: 'windows' | 'mac',
    overrides: Partial<AssetBundleConversionFinishedEvent> = {}
  ): AssetBundleConversionFinishedEvent => ({
    metadata: {
      entityId,
      platform,
      statusCode: ManifestStatusCode.SUCCESS,
      isLods: false,
      isWorld: false,
      version: 'v1',
      ...overrides.metadata
    },
    type: Events.Type.ASSET_BUNDLE,
    subType: Events.SubType.AssetBundle.CONVERTED,
    key: entityId,
    timestamp: Date.now(),
    ...overrides
  })

  const mockGenesisCityDeployment = (entity: Entity): void => {
    spyComponents.worlds.isWorldDeployment.mockReturnValue(false)
    spyComponents.catalyst.getEntityById.mockResolvedValue(entity)
  }

  describe('when both platform texture conversions complete for a scene', () => {
    let entityId: string

    beforeEach(async () => {
      entityId = `texture-both-complete-${Date.now()}`
      const entity = createEntity({ id: entityId, pointers: ['900,900'], timestamp: 1000 })
      mockGenesisCityDeployment(entity)

      registriesToCleanUp.push(entityId)
      await components.messageProcessor.process(createDeploymentMessage(entityId))

      // Process windows conversion
      await components.messageProcessor.process(createTextureEvent(entityId, 'windows'))
      // Process mac conversion
      await components.messageProcessor.process(createTextureEvent(entityId, 'mac'))
    })

    it('should mark the registry as complete', async () => {
      const registry = await components.db.getRegistryById(entityId)

      expect(registry).not.toBeNull()
      expect(registry!.status).toBe(Registry.Status.COMPLETE)
    })

    it('should have both platform bundles as complete', async () => {
      const registry = await components.db.getRegistryById(entityId)

      expect(registry!.bundles.assets.windows).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(registry!.bundles.assets.mac).toBe(Registry.SimplifiedStatus.COMPLETE)
    })
  })

  describe('when one platform conversion fails', () => {
    let entityId: string

    beforeEach(async () => {
      entityId = `texture-one-failed-${Date.now()}`
      const entity = createEntity({ id: entityId, pointers: ['901,901'], timestamp: 1000 })
      mockGenesisCityDeployment(entity)

      registriesToCleanUp.push(entityId)
      await components.messageProcessor.process(createDeploymentMessage(entityId))

      // Windows succeeds
      await components.messageProcessor.process(createTextureEvent(entityId, 'windows'))
      // Mac fails
      await components.messageProcessor.process(
        createTextureEvent(entityId, 'mac', {
          metadata: {
            entityId,
            platform: 'mac',
            statusCode: ManifestStatusCode.ASSET_BUNDLE_BUILD_FAIL,
            isLods: false,
            isWorld: false,
            version: 'v1'
          }
        })
      )
    })

    it('should mark the registry as failed', async () => {
      const registry = await components.db.getRegistryById(entityId)

      expect(registry).not.toBeNull()
      expect(registry!.status).toBe(Registry.Status.FAILED)
    })
  })

  describe('when a newer scene fails and an older complete scene exists at the same pointers', () => {
    let olderEntityId: string
    let newerEntityId: string

    beforeEach(async () => {
      olderEntityId = `texture-fallback-older-${Date.now()}`
      newerEntityId = `texture-fallback-newer-${Date.now()}`

      // Deploy and complete the older scene
      const olderEntity = createEntity({ id: olderEntityId, pointers: ['902,902'], timestamp: 1000 })
      mockGenesisCityDeployment(olderEntity)
      registriesToCleanUp.push(olderEntityId)
      await components.messageProcessor.process(createDeploymentMessage(olderEntityId))
      await components.messageProcessor.process(createTextureEvent(olderEntityId, 'windows'))
      await components.messageProcessor.process(createTextureEvent(olderEntityId, 'mac'))

      // Deploy the newer scene at the same pointers
      const newerEntity = createEntity({ id: newerEntityId, pointers: ['902,902'], timestamp: 2000 })
      mockGenesisCityDeployment(newerEntity)
      registriesToCleanUp.push(newerEntityId)
      await components.messageProcessor.process(createDeploymentMessage(newerEntityId))

      // Newer scene fails on mac
      await components.messageProcessor.process(createTextureEvent(newerEntityId, 'windows'))
      await components.messageProcessor.process(
        createTextureEvent(newerEntityId, 'mac', {
          metadata: {
            entityId: newerEntityId,
            platform: 'mac',
            statusCode: ManifestStatusCode.ASSET_BUNDLE_BUILD_FAIL,
            isLods: false,
            isWorld: false,
            version: 'v1'
          }
        })
      )
    })

    it('should mark the newer registry as failed', async () => {
      const newerRegistry = await components.db.getRegistryById(newerEntityId)

      expect(newerRegistry).not.toBeNull()
      expect(newerRegistry!.status).toBe(Registry.Status.FAILED)
    })

    it('should preserve the older registry as fallback', async () => {
      const olderRegistry = await components.db.getRegistryById(olderEntityId)

      expect(olderRegistry).not.toBeNull()
      expect(olderRegistry!.status).toBe(Registry.Status.FALLBACK)
    })
  })

  describe('when concurrent texture events are processed for the same entity', () => {
    let entityId: string

    beforeEach(async () => {
      entityId = `texture-concurrent-${Date.now()}`
      const entity = createEntity({ id: entityId, pointers: ['903,903'], timestamp: 1000 })
      mockGenesisCityDeployment(entity)

      registriesToCleanUp.push(entityId)
      await components.messageProcessor.process(createDeploymentMessage(entityId))

      // Process both platform conversions concurrently
      await Promise.all([
        components.messageProcessor.process(createTextureEvent(entityId, 'windows')),
        components.messageProcessor.process(createTextureEvent(entityId, 'mac'))
      ])
    })

    it('should mark the registry as complete', async () => {
      const registry = await components.db.getRegistryById(entityId)

      expect(registry).not.toBeNull()
      expect(registry!.status).toBe(Registry.Status.COMPLETE)
    })

    it('should have both platform bundles as complete', async () => {
      const registry = await components.db.getRegistryById(entityId)

      expect(registry!.bundles.assets.windows).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(registry!.bundles.assets.mac).toBe(Registry.SimplifiedStatus.COMPLETE)
    })
  })

  describe('when concurrent texture events are processed and there is a fallback scene', () => {
    let olderEntityId: string
    let newerEntityId: string

    beforeEach(async () => {
      olderEntityId = `texture-concurrent-fallback-older-${Date.now()}`
      newerEntityId = `texture-concurrent-fallback-newer-${Date.now()}`

      // Deploy and complete the older scene
      const olderEntity = createEntity({ id: olderEntityId, pointers: ['904,904'], timestamp: 1000 })
      mockGenesisCityDeployment(olderEntity)
      registriesToCleanUp.push(olderEntityId)
      await components.messageProcessor.process(createDeploymentMessage(olderEntityId))
      await components.messageProcessor.process(createTextureEvent(olderEntityId, 'windows'))
      await components.messageProcessor.process(createTextureEvent(olderEntityId, 'mac'))

      // Deploy the newer scene at the same pointers
      const newerEntity = createEntity({ id: newerEntityId, pointers: ['904,904'], timestamp: 2000 })
      mockGenesisCityDeployment(newerEntity)
      registriesToCleanUp.push(newerEntityId)
      await components.messageProcessor.process(createDeploymentMessage(newerEntityId))

      // Process both platform conversions concurrently for the newer scene
      await Promise.all([
        components.messageProcessor.process(createTextureEvent(newerEntityId, 'windows')),
        components.messageProcessor.process(createTextureEvent(newerEntityId, 'mac'))
      ])
    })

    it('should mark the newer registry as complete', async () => {
      const newerRegistry = await components.db.getRegistryById(newerEntityId)

      expect(newerRegistry).not.toBeNull()
      expect(newerRegistry!.status).toBe(Registry.Status.COMPLETE)
    })

    it('should mark the older registry as obsolete since the newer one is complete', async () => {
      const olderRegistry = await components.db.getRegistryById(olderEntityId)

      expect(olderRegistry).not.toBeNull()
      expect(olderRegistry!.status).toBe(Registry.Status.OBSOLETE)
    })
  })
})
