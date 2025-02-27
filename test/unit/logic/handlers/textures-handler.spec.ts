import { AssetBundleConversionFinishedEvent, AuthLinkType, Entity, EntityType, Events } from '@dcl/schemas'
import { createInMemoryCacheComponent } from '../../../../src/adapters/memory-cache'
import { createTexturesEventHandler } from '../../../../src/logic/handlers/textures-handler'
import { createQueuesStatusManagerComponent } from '../../../../src/logic/queues-status-manager'
import { Registry } from '../../../../src/types'
import { createCatalystMockComponent } from '../../mocks/catalyst'
import { createDbMockComponent } from '../../mocks/db'
import { createLogMockComponent } from '../../mocks/logs'
import { createWorldsMockComponent } from '../../mocks/worlds'
import { ManifestStatusCode } from '../../../../src/logic/entity-status-fetcher'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'

describe('textures-handler', () => {
  const logs = createLogMockComponent()
  const db = createDbMockComponent()
  const catalyst = createCatalystMockComponent()
  const worlds = createWorldsMockComponent()
  const registryOrchestrator = {
    persistAndRotateStates: jest.fn()
  }
  const memoryStorage = createInMemoryCacheComponent()
  const queuesStatusManager = createQueuesStatusManagerComponent({ memoryStorage })

  const createEvent = (
    overrides: Partial<AssetBundleConversionFinishedEvent> = {}
  ): AssetBundleConversionFinishedEvent => ({
    metadata: {
      entityId: '123',
      platform: 'windows' as const,
      statusCode: ManifestStatusCode.SUCCESS,
      isLods: false,
      isWorld: false,
      ...overrides.metadata
    },
    type: Events.Type.ASSET_BUNDLE,
    subType: Events.SubType.AssetBundle.CONVERTED,
    key: '123',
    timestamp: Date.now(),
    ...overrides
  })

  const createEntity = (overrides: Partial<Entity> = {}): Entity => ({
    id: '123',
    version: '1',
    type: EntityType.SCENE,
    pointers: ['0,0'],
    timestamp: Date.now(),
    content: [],
    metadata: {},
    ...overrides
  })

  const createDbEntity = (entity: Entity) => ({
    ...entity,
    deployer: '',
    status: Registry.Status.PENDING,
    type: EntityType.SCENE,
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

  const handler = createTexturesEventHandler({
    logs,
    db,
    catalyst,
    worlds,
    registryOrchestrator,
    queuesStatusManager
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('canHandle', () => {
    it('should return true for valid AssetBundleConversionFinishedEvent', () => {
      const event = createEvent()
      expect(handler.canHandle(event)).toBe(true)
    })

    it('should return false for invalid event', () => {
      const invalidEvent: DeploymentToSqs = {
        entity: {
          entityId: '123',
          authChain: [
            {
              signature: 'signature',
              type: AuthLinkType.SIGNER,
              payload: 'payload'
            }
          ]
        }
      }
      expect(handler.canHandle(invalidEvent as any)).toBe(false)
    })
  })

  describe('handle', () => {
    describe('when entity does not exist', () => {
      it('should create entity with default bundle status when fetched from catalyst', async () => {
        const event = createEvent()
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        db.getRegistryById = jest.fn().mockResolvedValue(null)
        catalyst.getEntityById = jest.fn().mockResolvedValue(entity)
        db.upsertRegistryBundle = jest.fn().mockResolvedValue({
          ...dbEntity,
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

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(registryOrchestrator.persistAndRotateStates).toHaveBeenCalledWith(dbEntity)
      })

      it('should create entity with default bundle status when fetched from worlds', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.SUCCESS,
            isLods: false,
            isWorld: true
          }
        })
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        db.getRegistryById = jest.fn().mockResolvedValue(null)
        worlds.getWorld = jest.fn().mockResolvedValue(entity)
        db.upsertRegistryBundle = jest.fn().mockResolvedValue({
          ...dbEntity,
          bundles: {
            assets: {
              windows: Registry.SimplifiedStatus.COMPLETE,
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

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(worlds.getWorld).toHaveBeenCalledWith(event.metadata.entityId)
      })

      it('should return error when entity not found in catalyst or worlds', async () => {
        const event = createEvent()
        db.getRegistryById = jest.fn().mockResolvedValue(null)
        catalyst.getEntityById = jest.fn().mockResolvedValue(null)

        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual([`Entity with id ${event.metadata.entityId} was not found`])
      })
    })

    describe('when entity exists', () => {
      it('should update bundle status for windows platform', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.SUCCESS,
            isLods: false,
            isWorld: false
          }
        })
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        db.getRegistryById = jest.fn().mockResolvedValue(dbEntity)
        db.upsertRegistryBundle = jest.fn().mockResolvedValue({
          ...dbEntity,
          bundles: {
            assets: {
              windows: Registry.SimplifiedStatus.COMPLETE,
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

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
      })

      it('should update bundle status for mac platform with tolerated errors', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'mac',
            statusCode: ManifestStatusCode.CONVERSION_ERRORS_TOLERATED,
            isLods: false,
            isWorld: false
          }
        })
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        db.getRegistryById = jest.fn().mockResolvedValue(dbEntity)
        db.upsertRegistryBundle = jest.fn().mockResolvedValue({
          ...dbEntity,
          bundles: {
            assets: {
              windows: Registry.SimplifiedStatus.PENDING,
              mac: Registry.SimplifiedStatus.COMPLETE,
              webgl: Registry.SimplifiedStatus.PENDING
            },
            lods: {
              windows: Registry.SimplifiedStatus.PENDING,
              mac: Registry.SimplifiedStatus.PENDING,
              webgl: Registry.SimplifiedStatus.PENDING
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
      })

      it('should update bundle status for webgl platform with already converted status', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'webgl',
            statusCode: ManifestStatusCode.ALREADY_CONVERTED,
            isLods: false,
            isWorld: false
          }
        })
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        db.getRegistryById = jest.fn().mockResolvedValue(dbEntity)
        db.upsertRegistryBundle = jest.fn().mockResolvedValue({
          ...dbEntity,
          bundles: {
            assets: {
              windows: Registry.SimplifiedStatus.PENDING,
              mac: Registry.SimplifiedStatus.PENDING,
              webgl: Registry.SimplifiedStatus.COMPLETE
            },
            lods: {
              windows: Registry.SimplifiedStatus.PENDING,
              mac: Registry.SimplifiedStatus.PENDING,
              webgl: Registry.SimplifiedStatus.PENDING
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
      })

      it('should mark bundle as failed when conversion fails', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.ASSET_BUNDLE_BUILD_FAIL,
            isLods: false,
            isWorld: false
          }
        })
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        db.getRegistryById = jest.fn().mockResolvedValue(dbEntity)
        db.upsertRegistryBundle = jest.fn().mockResolvedValue({
          ...dbEntity,
          bundles: {
            assets: {
              windows: Registry.SimplifiedStatus.FAILED,
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

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
      })

      it('should update lods bundle status when isLods is true', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.SUCCESS,
            isLods: true,
            isWorld: false
          }
        })
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        db.getRegistryById = jest.fn().mockResolvedValue(dbEntity)
        db.upsertRegistryBundle = jest.fn().mockResolvedValue({
          ...dbEntity,
          bundles: {
            assets: {
              windows: Registry.SimplifiedStatus.COMPLETE,
              mac: Registry.SimplifiedStatus.PENDING,
              webgl: Registry.SimplifiedStatus.PENDING
            },
            lods: {
              windows: Registry.SimplifiedStatus.COMPLETE,
              mac: Registry.SimplifiedStatus.PENDING,
              webgl: Registry.SimplifiedStatus.PENDING
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
      })

      it('should return error when upsert fails', async () => {
        const event = createEvent()
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        db.getRegistryById = jest.fn().mockResolvedValue(dbEntity)
        db.upsertRegistryBundle = jest.fn().mockResolvedValue(null)

        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual(['Error storing bundle'])
      })

      it('should update bundle status for assets', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.SUCCESS,
            isLods: false,
            isWorld: false
          }
        })
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        ;(db.getRegistryById as jest.Mock).mockResolvedValue(dbEntity)
        ;(db.upsertRegistryBundle as jest.Mock).mockResolvedValue({
          ...dbEntity,
          bundles: {
            assets: {
              windows: Registry.SimplifiedStatus.COMPLETE,
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

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
      })

      it('should update bundle status for lods', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.SUCCESS,
            isLods: true,
            isWorld: false
          }
        })
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        ;(db.getRegistryById as jest.Mock).mockResolvedValue(dbEntity)
        ;(db.upsertRegistryBundle as jest.Mock).mockResolvedValue({
          ...dbEntity,
          bundles: {
            assets: {
              windows: Registry.SimplifiedStatus.COMPLETE,
              mac: Registry.SimplifiedStatus.PENDING,
              webgl: Registry.SimplifiedStatus.PENDING
            },
            lods: {
              windows: Registry.SimplifiedStatus.COMPLETE,
              mac: Registry.SimplifiedStatus.PENDING,
              webgl: Registry.SimplifiedStatus.PENDING
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
      })
    })
  })
})
