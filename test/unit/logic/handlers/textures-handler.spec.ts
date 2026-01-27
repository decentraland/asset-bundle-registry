import { AssetBundleConversionFinishedEvent, AuthLinkType, Entity, EntityType, Events } from '@dcl/schemas'
import { createInMemoryCacheComponent } from '../../../../src/adapters/memory-cache'
import { createTexturesEventHandler } from '../../../../src/logic/handlers/textures-handler'
import { createQueuesStatusManagerComponent } from '../../../../src/logic/queues-status-manager'
import { Registry } from '../../../../src/types'
import { createCatalystMockComponent } from '../../mocks/catalyst'
import { createDbMockComponent } from '../../mocks/db'
import { createLogMockComponent } from '../../mocks/logs'
import { createWorldsMockComponent } from '../../mocks/worlds'
import { createRegistryMockComponent } from '../../mocks/registry'
import { createCoordinatesMockComponent } from '../../mocks/coordinates'
import { ManifestStatusCode } from '../../../../src/logic/entity-status-fetcher'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'

describe('textures-handler', () => {
  const logs = createLogMockComponent()
  const db = createDbMockComponent()
  const catalyst = createCatalystMockComponent()
  const worlds = createWorldsMockComponent()
  const registry = createRegistryMockComponent()
  const coordinates = createCoordinatesMockComponent()
  const memoryStorage = createInMemoryCacheComponent()
  const queuesStatusManager = createQueuesStatusManagerComponent({
    memoryStorage
  })

  const createEvent = (
    overrides: Partial<AssetBundleConversionFinishedEvent> = {}
  ): AssetBundleConversionFinishedEvent => ({
    metadata: {
      entityId: '123',
      platform: 'windows' as const,
      statusCode: ManifestStatusCode.SUCCESS,
      isLods: false,
      isWorld: false,
      version: 'v1',
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
    },
    versions: {
      assets: {
        windows: { version: '', buildDate: '' },
        mac: { version: '', buildDate: '' },
        webgl: { version: '', buildDate: '' }
      }
    }
  })

  const handler = createTexturesEventHandler({
    logs,
    db,
    catalyst,
    worlds,
    registry,
    queuesStatusManager,
    coordinates
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
        // persistAndRotateStates must return the created entity so we can access bundles later
        registry.persistAndRotateStates = jest.fn().mockResolvedValue(dbEntity)
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
        db.updateRegistryVersionWithBuildDate = jest.fn().mockResolvedValue(dbEntity)

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(registry.persistAndRotateStates).toHaveBeenCalledWith(dbEntity)
        expect(db.updateRegistryVersionWithBuildDate).toHaveBeenCalledWith(
          '123',
          'windows',
          'v1',
          new Date(event.timestamp).toISOString()
        )
      })

      it('should create entity with default bundle status when fetched from worlds', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.SUCCESS,
            isLods: false,
            isWorld: true,
            version: 'v1'
          }
        })
        const entity = createEntity()
        const dbEntity = createDbEntity(entity)
        db.getRegistryById = jest.fn().mockResolvedValue(null)
        worlds.getWorld = jest.fn().mockResolvedValue(entity)
        // persistAndRotateStates must return the created entity so we can access bundles later
        registry.persistAndRotateStates = jest.fn().mockResolvedValue(dbEntity)
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
        db.updateRegistryVersionWithBuildDate = jest.fn().mockResolvedValue({
          ...dbEntity,
          versions: {
            assets: {
              windows: { version: 'v1', buildDate: '2024-01-01' },
              mac: { version: '', buildDate: '' },
              webgl: { version: '', buildDate: '' }
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(worlds.getWorld).toHaveBeenCalledWith(event.metadata.entityId)
        expect(db.updateRegistryVersionWithBuildDate).toHaveBeenCalledWith(
          '123',
          'windows',
          'v1',
          new Date(event.timestamp).toISOString()
        )
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
            isWorld: false,
            version: 'v1'
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
        db.updateRegistryVersionWithBuildDate = jest.fn().mockResolvedValue({
          ...dbEntity,
          versions: {
            assets: {
              windows: { version: 'v1', buildDate: '2024-01-01' },
              mac: { version: '', buildDate: '' },
              webgl: { version: '', buildDate: '' }
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(db.updateRegistryVersionWithBuildDate).toHaveBeenCalledWith(
          '123',
          'windows',
          'v1',
          new Date(event.timestamp).toISOString()
        )
      })

      it('should update bundle status for mac platform with tolerated errors', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'mac',
            statusCode: ManifestStatusCode.CONVERSION_ERRORS_TOLERATED,
            isLods: false,
            isWorld: false,
            version: 'v1'
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
        db.updateRegistryVersionWithBuildDate = jest.fn().mockResolvedValue({
          ...dbEntity,
          versions: {
            assets: {
              windows: { version: '', buildDate: '' },
              mac: { version: 'v1', buildDate: '2024-01-01' },
              webgl: { version: '', buildDate: '' }
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(db.updateRegistryVersionWithBuildDate).toHaveBeenCalledWith(
          '123',
          'mac',
          'v1',
          new Date(event.timestamp).toISOString()
        )
      })

      it('should update bundle status for webgl platform with already converted status', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'webgl',
            statusCode: ManifestStatusCode.ALREADY_CONVERTED,
            isLods: false,
            isWorld: false,
            version: 'v1'
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
        db.updateRegistryVersionWithBuildDate = jest.fn().mockResolvedValue({
          ...dbEntity,
          versions: {
            assets: {
              windows: { version: '', buildDate: '' },
              mac: { version: '', buildDate: '' },
              webgl: { version: 'v1', buildDate: '2024-01-01' }
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(db.updateRegistryVersionWithBuildDate).toHaveBeenCalledWith(
          '123',
          'webgl',
          'v1',
          new Date(event.timestamp).toISOString()
        )
      })

      it('should mark bundle as failed when conversion fails and entity had PENDING status', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.ASSET_BUNDLE_BUILD_FAIL,
            isLods: false,
            isWorld: false,
            version: 'v1'
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
        db.updateRegistryVersionWithBuildDate = jest.fn().mockResolvedValue({
          ...dbEntity,
          versions: {
            assets: {
              windows: { version: 'v1', buildDate: '2024-01-01' },
              mac: { version: '', buildDate: '' },
              webgl: { version: '', buildDate: '' }
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(db.upsertRegistryBundle).toHaveBeenCalledWith('123', 'windows', false, Registry.SimplifiedStatus.FAILED)
        expect(db.updateRegistryVersionWithBuildDate).toHaveBeenCalledWith(
          '123',
          'windows',
          'v1',
          new Date(event.timestamp).toISOString()
        )
      })

      describe('and reconversion fails', () => {
        describe('and entity already had COMPLETE asset bundles', () => {
          let event: AssetBundleConversionFinishedEvent
          let dbEntityWithCompleteBundles: Registry.DbEntity
          let result: { ok: boolean; errors?: string[] }

          beforeEach(async () => {
            event = createEvent({
              metadata: {
                entityId: '123',
                platform: 'windows',
                statusCode: ManifestStatusCode.ASSET_BUNDLE_BUILD_FAIL,
                isLods: false,
                isWorld: false,
                version: 'v2'
              }
            })
            const entity = createEntity()
            dbEntityWithCompleteBundles = {
              ...createDbEntity(entity),
              bundles: {
                assets: {
                  windows: Registry.SimplifiedStatus.COMPLETE,
                  mac: Registry.SimplifiedStatus.COMPLETE,
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
                  windows: { version: 'v1', buildDate: '2024-01-01' },
                  mac: { version: 'v1', buildDate: '2024-01-01' },
                  webgl: { version: '', buildDate: '' }
                }
              }
            }
            db.getRegistryById = jest.fn().mockResolvedValue(dbEntityWithCompleteBundles)
            db.upsertRegistryBundle = jest.fn().mockResolvedValue(dbEntityWithCompleteBundles)

            result = await handler.handle(event)
          })

          it('should succeed', () => {
            expect(result.ok).toBe(true)
          })

          it('should preserve COMPLETE status instead of marking as FAILED', () => {
            expect(db.upsertRegistryBundle).toHaveBeenCalledWith(
              '123',
              'windows',
              false,
              Registry.SimplifiedStatus.COMPLETE
            )
          })

          it('should not update version to avoid pointing to non-existent bundles', () => {
            expect(db.updateRegistryVersionWithBuildDate).not.toHaveBeenCalled()
          })

          it('should still call persistAndRotateStates', () => {
            expect(registry.persistAndRotateStates).toHaveBeenCalledWith(dbEntityWithCompleteBundles)
          })
        })

        describe('and entity already had COMPLETE LOD bundles', () => {
          let event: AssetBundleConversionFinishedEvent
          let dbEntityWithCompleteLods: Registry.DbEntity
          let result: { ok: boolean; errors?: string[] }

          beforeEach(async () => {
            event = createEvent({
              metadata: {
                entityId: '123',
                platform: 'mac',
                statusCode: ManifestStatusCode.GLTFAST_CRITICAL_ERROR,
                isLods: true,
                isWorld: false,
                version: 'v2'
              }
            })
            const entity = createEntity()
            dbEntityWithCompleteLods = {
              ...createDbEntity(entity),
              bundles: {
                assets: {
                  windows: Registry.SimplifiedStatus.COMPLETE,
                  mac: Registry.SimplifiedStatus.COMPLETE,
                  webgl: Registry.SimplifiedStatus.PENDING
                },
                lods: {
                  windows: Registry.SimplifiedStatus.COMPLETE,
                  mac: Registry.SimplifiedStatus.COMPLETE,
                  webgl: Registry.SimplifiedStatus.PENDING
                }
              }
            }
            db.getRegistryById = jest.fn().mockResolvedValue(dbEntityWithCompleteLods)
            db.upsertRegistryBundle = jest.fn().mockResolvedValue(dbEntityWithCompleteLods)

            result = await handler.handle(event)
          })

          it('should succeed', () => {
            expect(result.ok).toBe(true)
          })

          it('should preserve COMPLETE status for LODs', () => {
            expect(db.upsertRegistryBundle).toHaveBeenCalledWith('123', 'mac', true, Registry.SimplifiedStatus.COMPLETE)
          })

          it('should not update version', () => {
            expect(db.updateRegistryVersionWithBuildDate).not.toHaveBeenCalled()
          })
        })
      })

      describe('and reconversion succeeds', () => {
        describe('and entity already had COMPLETE asset bundles', () => {
          let event: AssetBundleConversionFinishedEvent
          let dbEntityWithCompleteBundles: Registry.DbEntity
          let updatedDbEntity: Registry.DbEntity
          let result: { ok: boolean; errors?: string[] }

          beforeEach(async () => {
            event = createEvent({
              metadata: {
                entityId: '123',
                platform: 'windows',
                statusCode: ManifestStatusCode.SUCCESS,
                isLods: false,
                isWorld: false,
                version: 'v2'
              }
            })
            const entity = createEntity()
            dbEntityWithCompleteBundles = {
              ...createDbEntity(entity),
              bundles: {
                assets: {
                  windows: Registry.SimplifiedStatus.COMPLETE,
                  mac: Registry.SimplifiedStatus.COMPLETE,
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
                  windows: { version: 'v1', buildDate: '2024-01-01' },
                  mac: { version: 'v1', buildDate: '2024-01-01' },
                  webgl: { version: '', buildDate: '' }
                }
              }
            }
            updatedDbEntity = {
              ...dbEntityWithCompleteBundles,
              versions: {
                assets: {
                  windows: { version: 'v2', buildDate: '2024-01-02' },
                  mac: { version: 'v1', buildDate: '2024-01-01' },
                  webgl: { version: '', buildDate: '' }
                }
              }
            }
            db.getRegistryById = jest.fn().mockResolvedValue(dbEntityWithCompleteBundles)
            db.upsertRegistryBundle = jest.fn().mockResolvedValue(dbEntityWithCompleteBundles)
            db.updateRegistryVersionWithBuildDate = jest.fn().mockResolvedValue(updatedDbEntity)

            result = await handler.handle(event)
          })

          it('should succeed', () => {
            expect(result.ok).toBe(true)
          })

          it('should update bundle status to COMPLETE', () => {
            expect(db.upsertRegistryBundle).toHaveBeenCalledWith(
              '123',
              'windows',
              false,
              Registry.SimplifiedStatus.COMPLETE
            )
          })

          it('should update version to the new version', () => {
            expect(db.updateRegistryVersionWithBuildDate).toHaveBeenCalledWith(
              '123',
              'windows',
              'v2',
              new Date(event.timestamp).toISOString()
            )
          })

          it('should call persistAndRotateStates with updated entity', () => {
            expect(registry.persistAndRotateStates).toHaveBeenCalledWith(updatedDbEntity)
          })
        })
      })

      it('should update lods bundle status when isLods is true', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.SUCCESS,
            isLods: true,
            isWorld: false,
            version: 'v1'
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
        db.updateRegistryVersionWithBuildDate = jest.fn().mockResolvedValue({
          ...dbEntity,
          versions: {
            assets: {
              windows: { version: 'v1', buildDate: '2024-01-01' },
              mac: { version: '', buildDate: '' },
              webgl: { version: '', buildDate: '' }
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(db.updateRegistryVersionWithBuildDate).toHaveBeenCalledWith(
          '123',
          'windows',
          'v1',
          new Date(event.timestamp).toISOString()
        )
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

      it('should return error when updateRegistryVersionWithBuildDate fails', async () => {
        const event = createEvent()
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
        db.updateRegistryVersionWithBuildDate = jest.fn().mockResolvedValue(null)

        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual(['Error storing version'])
      })

      it('should update bundle status for assets', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.SUCCESS,
            isLods: false,
            isWorld: false,
            version: 'v1'
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
        ;(db.updateRegistryVersionWithBuildDate as jest.Mock).mockResolvedValue({
          ...dbEntity,
          versions: {
            assets: {
              windows: { version: 'v1', buildDate: '2024-01-01' },
              mac: { version: '', buildDate: '' },
              webgl: { version: '', buildDate: '' }
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(db.updateRegistryVersionWithBuildDate).toHaveBeenCalledWith(
          '123',
          'windows',
          'v1',
          new Date(event.timestamp).toISOString()
        )
      })

      it('should update bundle status for lods', async () => {
        const event = createEvent({
          metadata: {
            entityId: '123',
            platform: 'windows',
            statusCode: ManifestStatusCode.SUCCESS,
            isLods: true,
            isWorld: false,
            version: 'v1'
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
        ;(db.updateRegistryVersionWithBuildDate as jest.Mock).mockResolvedValue({
          ...dbEntity,
          versions: {
            assets: {
              windows: { version: 'v1', buildDate: '' },
              mac: { version: '', buildDate: '' },
              webgl: { version: '', buildDate: '' }
            }
          }
        })

        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(db.updateRegistryVersionWithBuildDate).toHaveBeenCalledWith(
          '123',
          'windows',
          'v1',
          new Date(event.timestamp).toISOString()
        )
      })
    })
  })
})
