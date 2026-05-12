import {
  AssetBundleConversionFinishedEvent,
  AssetBundleConversionManuallyQueuedEvent,
  Entity,
  EntityType,
  Events
} from '@dcl/schemas'
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
  const historicalRegistriesToCleanUp: string[] = []

  beforeAll(async () => {
    identity = await getIdentity()
  })

  afterEach(async () => {
    if (registriesToCleanUp.length > 0) {
      await components.db.deleteRegistries(registriesToCleanUp)
      registriesToCleanUp.length = 0
    }
    if (historicalRegistriesToCleanUp.length > 0) {
      await components.extendedDb.deleteHistoricalRegistries(historicalRegistriesToCleanUp)
      historicalRegistriesToCleanUp.length = 0
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

  const createManualRequeueEvent = (
    entityId: string,
    platform: 'windows' | 'mac' | 'webgl'
  ): AssetBundleConversionManuallyQueuedEvent => ({
    type: Events.Type.ASSET_BUNDLE,
    subType: Events.SubType.AssetBundle.MANUALLY_QUEUED,
    key: entityId,
    timestamp: Date.now(),
    metadata: {
      entityId,
      platform,
      isLods: false,
      isPriority: false,
      version: 'v1'
    }
  })

  const seedHistoricalEntity = async (
    entity: Entity,
    overrides: Partial<Registry.DbEntity> = {}
  ): Promise<Registry.DbEntity> => {
    const dbEntity: Registry.DbEntity = {
      ...entity,
      deployer: identity.realAccount.address,
      type: EntityType.SCENE,
      status: Registry.Status.FAILED,
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
      },
      versions: {
        assets: {
          windows: { version: '', buildDate: '' },
          mac: { version: '', buildDate: '' },
          webgl: { version: '', buildDate: '' }
        }
      },
      ...overrides
    }

    await components.extendedDb.insertHistoricalRegistry(dbEntity)
    historicalRegistriesToCleanUp.push(dbEntity.id)
    return dbEntity
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

  describe('when a redeployment arrives before the first scene finishes conversion and the second one fails', () => {
    let olderEntityId: string
    let newerEntityId: string

    beforeEach(async () => {
      olderEntityId = `texture-redeploy-older-${Date.now()}`
      newerEntityId = `texture-redeploy-newer-${Date.now()}`

      // Deploy the older scene (textures have NOT completed yet)
      const olderEntity = createEntity({ id: olderEntityId, pointers: ['905,905'], timestamp: 1000 })
      mockGenesisCityDeployment(olderEntity)
      registriesToCleanUp.push(olderEntityId)
      await components.messageProcessor.process(createDeploymentMessage(olderEntityId))

      // Deploy the newer scene at the same pointers BEFORE older scene's textures complete
      const newerEntity = createEntity({ id: newerEntityId, pointers: ['905,905'], timestamp: 2000 })
      mockGenesisCityDeployment(newerEntity)
      registriesToCleanUp.push(newerEntityId)
      await components.messageProcessor.process(createDeploymentMessage(newerEntityId))

      // The older scene's textures complete — it was left as PENDING (not marked OBSOLETE)
      await components.messageProcessor.process(createTextureEvent(olderEntityId, 'windows'))
      await components.messageProcessor.process(createTextureEvent(olderEntityId, 'mac'))

      // The newer scene's textures fail
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

    it('should keep the older registry as complete since it was never marked obsolete', async () => {
      const olderRegistry = await components.db.getRegistryById(olderEntityId)

      expect(olderRegistry).not.toBeNull()
      expect(olderRegistry!.status).toBe(Registry.Status.COMPLETE)
    })

    it('should have the older registry bundles as complete', async () => {
      const olderRegistry = await components.db.getRegistryById(olderEntityId)

      expect(olderRegistry!.bundles.assets.windows).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(olderRegistry!.bundles.assets.mac).toBe(Registry.SimplifiedStatus.COMPLETE)
    })

    it('should mark the newer registry as failed', async () => {
      const newerRegistry = await components.db.getRegistryById(newerEntityId)

      expect(newerRegistry).not.toBeNull()
      expect(newerRegistry!.status).toBe(Registry.Status.FAILED)
    })

    it('should still have an active registry at the pointers', async () => {
      const olderRegistry = await components.db.getRegistryById(olderEntityId)

      // The older registry was never marked OBSOLETE — it completed and is served
      expect(olderRegistry!.status).toBe(Registry.Status.COMPLETE)
    })
  })

  describe('when the newer scene completes before the older one (out-of-order)', () => {
    let olderEntityId: string
    let newerEntityId: string

    beforeEach(async () => {
      olderEntityId = `texture-ooo-older-${Date.now()}`
      newerEntityId = `texture-ooo-newer-${Date.now()}`

      // Deploy both scenes before any textures arrive
      const olderEntity = createEntity({ id: olderEntityId, pointers: ['906,906'], timestamp: 1000 })
      mockGenesisCityDeployment(olderEntity)
      registriesToCleanUp.push(olderEntityId)
      await components.messageProcessor.process(createDeploymentMessage(olderEntityId))

      const newerEntity = createEntity({ id: newerEntityId, pointers: ['906,906'], timestamp: 2000 })
      mockGenesisCityDeployment(newerEntity)
      registriesToCleanUp.push(newerEntityId)
      await components.messageProcessor.process(createDeploymentMessage(newerEntityId))

      // Newer scene completes FIRST
      await components.messageProcessor.process(createTextureEvent(newerEntityId, 'windows'))
      await components.messageProcessor.process(createTextureEvent(newerEntityId, 'mac'))

      // Older scene completes AFTER
      await components.messageProcessor.process(createTextureEvent(olderEntityId, 'windows'))
      await components.messageProcessor.process(createTextureEvent(olderEntityId, 'mac'))
    })

    it('should mark the older registry as obsolete since a newer one is already complete', async () => {
      const olderRegistry = await components.db.getRegistryById(olderEntityId)

      expect(olderRegistry).not.toBeNull()
      expect(olderRegistry!.status).toBe(Registry.Status.OBSOLETE)
    })

    it('should keep the newer registry as complete', async () => {
      const newerRegistry = await components.db.getRegistryById(newerEntityId)

      expect(newerRegistry).not.toBeNull()
      expect(newerRegistry!.status).toBe(Registry.Status.COMPLETE)
    })
  })

  describe('when three rapid deployments happen and none complete before the next arrives', () => {
    let entityAId: string
    let entityBId: string
    let entityCId: string

    beforeEach(async () => {
      entityAId = `texture-triple-a-${Date.now()}`
      entityBId = `texture-triple-b-${Date.now()}`
      entityCId = `texture-triple-c-${Date.now()}`

      // Deploy all three before any textures complete
      const entityA = createEntity({ id: entityAId, pointers: ['907,907'], timestamp: 1000 })
      mockGenesisCityDeployment(entityA)
      registriesToCleanUp.push(entityAId)
      await components.messageProcessor.process(createDeploymentMessage(entityAId))

      const entityB = createEntity({ id: entityBId, pointers: ['907,907'], timestamp: 2000 })
      mockGenesisCityDeployment(entityB)
      registriesToCleanUp.push(entityBId)
      await components.messageProcessor.process(createDeploymentMessage(entityBId))

      const entityC = createEntity({ id: entityCId, pointers: ['907,907'], timestamp: 3000 })
      mockGenesisCityDeployment(entityC)
      registriesToCleanUp.push(entityCId)
      await components.messageProcessor.process(createDeploymentMessage(entityCId))

      // A completes
      await components.messageProcessor.process(createTextureEvent(entityAId, 'windows'))
      await components.messageProcessor.process(createTextureEvent(entityAId, 'mac'))

      // B fails
      await components.messageProcessor.process(
        createTextureEvent(entityBId, 'mac', {
          metadata: {
            entityId: entityBId,
            platform: 'mac',
            statusCode: ManifestStatusCode.ASSET_BUNDLE_BUILD_FAIL,
            isLods: false,
            isWorld: false,
            version: 'v1'
          }
        })
      )

      // C fails
      await components.messageProcessor.process(
        createTextureEvent(entityCId, 'mac', {
          metadata: {
            entityId: entityCId,
            platform: 'mac',
            statusCode: ManifestStatusCode.ASSET_BUNDLE_BUILD_FAIL,
            isLods: false,
            isWorld: false,
            version: 'v1'
          }
        })
      )
    })

    it('should keep entity A as complete since it successfully converted', async () => {
      const registryA = await components.db.getRegistryById(entityAId)

      expect(registryA).not.toBeNull()
      expect(registryA!.status).toBe(Registry.Status.COMPLETE)
    })

    it('should mark entity B as failed', async () => {
      const registryB = await components.db.getRegistryById(entityBId)

      expect(registryB).not.toBeNull()
      expect(registryB!.status).toBe(Registry.Status.FAILED)
    })

    it('should mark entity C as failed', async () => {
      const registryC = await components.db.getRegistryById(entityCId)

      expect(registryC).not.toBeNull()
      expect(registryC!.status).toBe(Registry.Status.FAILED)
    })
  })

  describe('when a purged entity is manually re-queued and a texture event arrives', () => {
    let entityId: string

    beforeEach(async () => {
      entityId = `texture-restore-happy-${Date.now()}`
      const entity = createEntity({ id: entityId, pointers: ['910,910'], timestamp: 1000 })
      await seedHistoricalEntity(entity, {
        status: Registry.Status.FAILED,
        bundles: {
          assets: {
            windows: Registry.SimplifiedStatus.FAILED,
            mac: Registry.SimplifiedStatus.COMPLETE,
            webgl: Registry.SimplifiedStatus.COMPLETE
          },
          lods: {
            windows: Registry.SimplifiedStatus.PENDING,
            mac: Registry.SimplifiedStatus.PENDING,
            webgl: Registry.SimplifiedStatus.PENDING
          }
        }
      })
      registriesToCleanUp.push(entityId)

      await components.messageProcessor.process(createManualRequeueEvent(entityId, 'windows'))
      await components.messageProcessor.process(createTextureEvent(entityId, 'windows'))
    })

    it('should restore the entity into the active registries table', async () => {
      const registry = await components.db.getRegistryById(entityId)
      expect(registry).not.toBeNull()
    })

    it('should apply the successful bundle update to the restored entity', async () => {
      const registry = await components.db.getRegistryById(entityId)
      expect(registry!.bundles.assets.windows).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(registry!.bundles.assets.mac).toBe(Registry.SimplifiedStatus.COMPLETE)
    })

    it('should mark the restored entity as complete', async () => {
      const registry = await components.db.getRegistryById(entityId)
      expect(registry!.status).toBe(Registry.Status.COMPLETE)
    })

    it('should remove the historical row after the restore', async () => {
      const historical = await components.db.getHistoricalRegistryById(entityId)
      expect(historical).toBeNull()
    })

    it('should clear the manual re-queue marker so a follow-up stale event is skipped again', async () => {
      const stillManuallyQueued = await components.queuesStatusManager.isManuallyQueued('windows', entityId)
      expect(stillManuallyQueued).toBe(false)
    })
  })

  describe('when a purged entity has no manual re-queue marker and a texture event arrives', () => {
    let entityId: string

    beforeEach(async () => {
      entityId = `texture-restore-skip-${Date.now()}`
      const entity = createEntity({ id: entityId, pointers: ['911,911'], timestamp: 1000 })
      await seedHistoricalEntity(entity, { status: Registry.Status.FAILED })

      await components.messageProcessor.process(createTextureEvent(entityId, 'windows'))
    })

    it('should not move the entity into the active registries table', async () => {
      const registry = await components.db.getRegistryById(entityId)
      expect(registry).toBeNull()
    })

    it('should leave the historical row untouched', async () => {
      const historical = await components.db.getHistoricalRegistryById(entityId)
      expect(historical).not.toBeNull()
      expect(historical!.status).toBe(Registry.Status.FAILED)
    })
  })

  describe('when two concurrent texture events arrive for a purged, manually re-queued entity', () => {
    let entityId: string

    beforeEach(async () => {
      entityId = `texture-restore-race-${Date.now()}`
      const entity = createEntity({ id: entityId, pointers: ['912,912'], timestamp: 1000 })
      await seedHistoricalEntity(entity, {
        status: Registry.Status.FAILED,
        bundles: {
          assets: {
            windows: Registry.SimplifiedStatus.FAILED,
            mac: Registry.SimplifiedStatus.FAILED,
            webgl: Registry.SimplifiedStatus.PENDING
          },
          lods: {
            windows: Registry.SimplifiedStatus.PENDING,
            mac: Registry.SimplifiedStatus.PENDING,
            webgl: Registry.SimplifiedStatus.PENDING
          }
        }
      })
      registriesToCleanUp.push(entityId)

      await components.messageProcessor.process(createManualRequeueEvent(entityId, 'windows'))
      await components.messageProcessor.process(createManualRequeueEvent(entityId, 'mac'))

      await Promise.all([
        components.messageProcessor.process(createTextureEvent(entityId, 'windows')),
        components.messageProcessor.process(createTextureEvent(entityId, 'mac'))
      ])
    })

    it('should mark the restored entity as complete', async () => {
      const registry = await components.db.getRegistryById(entityId)
      expect(registry).not.toBeNull()
      expect(registry!.status).toBe(Registry.Status.COMPLETE)
    })

    it('should not let either platform stomp the other back to a stale historical bundle', async () => {
      const registry = await components.db.getRegistryById(entityId)
      expect(registry!.bundles.assets.windows).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(registry!.bundles.assets.mac).toBe(Registry.SimplifiedStatus.COMPLETE)
    })

    it('should remove the historical row exactly once', async () => {
      const historical = await components.db.getHistoricalRegistryById(entityId)
      expect(historical).toBeNull()
    })
  })

  describe('when an OBSOLETE purged entity is manually re-queued while a newer COMPLETE entity exists at the same pointers', () => {
    let olderEntityId: string
    let newerEntityId: string

    beforeEach(async () => {
      olderEntityId = `texture-restore-obsolete-older-${Date.now()}`
      newerEntityId = `texture-restore-obsolete-newer-${Date.now()}`

      // Newer COMPLETE entity is the active one in registries at this pointer
      const newerEntity = createEntity({ id: newerEntityId, pointers: ['913,913'], timestamp: 2000 })
      mockGenesisCityDeployment(newerEntity)
      registriesToCleanUp.push(newerEntityId)
      await components.messageProcessor.process(createDeploymentMessage(newerEntityId))
      await components.messageProcessor.process(createTextureEvent(newerEntityId, 'windows'))
      await components.messageProcessor.process(createTextureEvent(newerEntityId, 'mac'))

      // Older entity sits in historical_registries having been OBSOLETE-purged
      const olderEntity = createEntity({ id: olderEntityId, pointers: ['913,913'], timestamp: 1000 })
      await seedHistoricalEntity(olderEntity, {
        status: Registry.Status.OBSOLETE,
        bundles: {
          assets: {
            windows: Registry.SimplifiedStatus.FAILED,
            mac: Registry.SimplifiedStatus.COMPLETE,
            webgl: Registry.SimplifiedStatus.COMPLETE
          },
          lods: {
            windows: Registry.SimplifiedStatus.PENDING,
            mac: Registry.SimplifiedStatus.PENDING,
            webgl: Registry.SimplifiedStatus.PENDING
          }
        }
      })
      registriesToCleanUp.push(olderEntityId)

      await components.messageProcessor.process(createManualRequeueEvent(olderEntityId, 'windows'))
      await components.messageProcessor.process(createTextureEvent(olderEntityId, 'windows'))
    })

    it('should still mark the restored older entity as OBSOLETE because a newer COMPLETE one exists', async () => {
      const olderRegistry = await components.db.getRegistryById(olderEntityId)
      expect(olderRegistry).not.toBeNull()
      expect(olderRegistry!.status).toBe(Registry.Status.OBSOLETE)
    })

    it('should leave the newer COMPLETE entity untouched', async () => {
      const newerRegistry = await components.db.getRegistryById(newerEntityId)
      expect(newerRegistry).not.toBeNull()
      expect(newerRegistry!.status).toBe(Registry.Status.COMPLETE)
    })
  })

  describe('db.restoreFromHistoricalRegistry direct behavior', () => {
    describe('when only a historical row exists', () => {
      let entityId: string

      beforeEach(async () => {
        entityId = `db-restore-direct-historical-${Date.now()}`
        const entity = createEntity({ id: entityId, pointers: ['914,914'], timestamp: 1000 })
        await seedHistoricalEntity(entity, { status: Registry.Status.FAILED })
        registriesToCleanUp.push(entityId)
      })

      it('should move the row into registries with status PENDING and remove the historical row', async () => {
        const restored = await components.db.restoreFromHistoricalRegistry(entityId)

        expect(restored).not.toBeNull()
        expect(restored!.status).toBe(Registry.Status.PENDING)

        const inRegistries = await components.db.getRegistryById(entityId)
        const inHistorical = await components.db.getHistoricalRegistryById(entityId)
        expect(inRegistries).not.toBeNull()
        expect(inHistorical).toBeNull()
      })
    })

    describe('when no historical row exists but a live registries row does', () => {
      let entityId: string

      beforeEach(async () => {
        entityId = `db-restore-direct-fallback-${Date.now()}`
        const entity = createEntity({ id: entityId, pointers: ['915,915'], timestamp: 1000 })
        mockGenesisCityDeployment(entity)
        registriesToCleanUp.push(entityId)
        await components.messageProcessor.process(createDeploymentMessage(entityId))
      })

      it('should return the existing live row without modifying it', async () => {
        const before = await components.db.getRegistryById(entityId)
        const restored = await components.db.restoreFromHistoricalRegistry(entityId)
        const after = await components.db.getRegistryById(entityId)

        expect(restored).not.toBeNull()
        expect(restored!.id).toBe(entityId)
        expect(after!.status).toBe(before!.status)
        expect(after!.bundles).toEqual(before!.bundles)
      })
    })

    describe('when neither historical nor active registries have the row', () => {
      it('should return null', async () => {
        const entityId = `db-restore-direct-missing-${Date.now()}`
        const restored = await components.db.restoreFromHistoricalRegistry(entityId)
        expect(restored).toBeNull()
      })
    })
  })
})
