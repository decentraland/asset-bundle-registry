import { Entity, EntityType } from '@dcl/schemas'
import { AuthLinkType } from '@dcl/crypto'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { createDeploymentEventHandler } from '../../../../src/logic/handlers/deployment-handler'
import { parseAllowedContentServerHosts } from '../../../../src/logic/validation'
import { EventHandlerName, Registry } from '../../../../src/types'
import { createDbMockComponent } from '../../mocks/db'
import { createLogMockComponent } from '../../mocks/logs'
import { createCatalystMockComponent } from '../../mocks/catalyst'
import { createWorldsMockComponent } from '../../mocks/worlds'
import { createRegistryMockComponent } from '../../mocks/registry'

describe('when handling deployment events', () => {
  const allowedContentServerHosts = parseAllowedContentServerHosts(
    'peer.decentraland.org, worlds-content-server.decentraland.org'
  )

  const createDeploymentEvent = (entityId: string, contentServerUrls?: string[]): DeploymentToSqs => ({
    entity: {
      entityId,
      authChain: [
        {
          type: AuthLinkType.SIGNER,
          payload: '0x1234567890abcdef1234567890abcdef12345678',
          signature: ''
        }
      ]
    },
    contentServerUrls
  })

  const createEntity = (overrides: Partial<Entity> = {}): Entity => ({
    id: 'test-entity-id',
    version: '1',
    type: EntityType.SCENE,
    pointers: ['0,0'],
    timestamp: Date.now(),
    content: [],
    metadata: {},
    ...overrides
  })

  describe('and calling canHandle', () => {
    let logs: ReturnType<typeof createLogMockComponent>
    let db: ReturnType<typeof createDbMockComponent>
    let catalyst: ReturnType<typeof createCatalystMockComponent>
    let worlds: ReturnType<typeof createWorldsMockComponent>
    let registry: ReturnType<typeof createRegistryMockComponent>
    let handler: ReturnType<typeof createDeploymentEventHandler>

    beforeEach(() => {
      logs = createLogMockComponent()
      db = createDbMockComponent()
      catalyst = createCatalystMockComponent()
      worlds = createWorldsMockComponent()
      registry = createRegistryMockComponent()
      handler = createDeploymentEventHandler({ logs, db, catalyst, worlds, registry }, allowedContentServerHosts)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the event is a valid DeploymentToSqs', () => {
      let event: DeploymentToSqs

      beforeEach(() => {
        event = createDeploymentEvent('test-entity-id')
      })

      it('should return true', () => {
        expect(handler.canHandle(event)).toBe(true)
      })
    })

    describe('and the event is invalid', () => {
      let invalidEvent: any

      beforeEach(() => {
        invalidEvent = { invalid: 'event' }
      })

      it('should return false', () => {
        expect(handler.canHandle(invalidEvent)).toBe(false)
      })
    })
  })

  describe('and calling handle', () => {
    let logs: ReturnType<typeof createLogMockComponent>
    let db: ReturnType<typeof createDbMockComponent>
    let catalyst: ReturnType<typeof createCatalystMockComponent>
    let worlds: ReturnType<typeof createWorldsMockComponent>
    let registry: ReturnType<typeof createRegistryMockComponent>
    let handler: ReturnType<typeof createDeploymentEventHandler>

    beforeEach(() => {
      logs = createLogMockComponent()
      db = createDbMockComponent()
      catalyst = createCatalystMockComponent()
      worlds = createWorldsMockComponent()
      registry = createRegistryMockComponent()
      handler = createDeploymentEventHandler({ logs, db, catalyst, worlds, registry }, allowedContentServerHosts)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the registry already exists', () => {
      let event: DeploymentToSqs
      let existingRegistry: Registry.DbEntity

      beforeEach(() => {
        event = createDeploymentEvent('existing-entity-id')
        existingRegistry = {
          id: 'existing-entity-id',
          pointers: ['0,0'],
          timestamp: Date.now(),
          content: [],
          metadata: {},
          deployer: '0x1234567890abcdef1234567890abcdef12345678',
          status: Registry.Status.COMPLETE,
          type: EntityType.SCENE,
          bundles: {
            assets: {
              windows: Registry.SimplifiedStatus.COMPLETE,
              mac: Registry.SimplifiedStatus.COMPLETE,
              webgl: Registry.SimplifiedStatus.COMPLETE
            },
            lods: {
              windows: Registry.SimplifiedStatus.COMPLETE,
              mac: Registry.SimplifiedStatus.COMPLETE,
              webgl: Registry.SimplifiedStatus.COMPLETE
            }
          },
          versions: {
            assets: {
              windows: { version: 'v1', buildDate: '' },
              mac: { version: 'v1', buildDate: '' },
              webgl: { version: 'v1', buildDate: '' }
            }
          }
        }
        db.getRegistryById.mockResolvedValue(existingRegistry)
      })

      it('should return ok without processing', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.DEPLOYMENT)
        expect(registry.persistAndRotateStates).not.toHaveBeenCalled()
      })
    })

    describe('and the deployment is a Genesis City scene', () => {
      let event: DeploymentToSqs
      let entity: Entity

      beforeEach(() => {
        event = createDeploymentEvent('genesis-entity-id')
        entity = createEntity({ id: 'genesis-entity-id', pointers: ['0,0'] })
        db.getRegistryById.mockResolvedValue(null)
        worlds.isWorldDeployment.mockReturnValue(false)
        catalyst.getEntityById.mockResolvedValue(entity)
        registry.persistAndRotateStates.mockResolvedValue(undefined as any)
      })

      it('should fetch the entity from the catalyst', async () => {
        await handler.handle(event)

        expect(catalyst.getEntityById).toHaveBeenCalledWith('genesis-entity-id', {
          overrideContentServerUrl: undefined
        })
      })

      it('should persist the registry with default bundle statuses', async () => {
        await handler.handle(event)

        expect(registry.persistAndRotateStates).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'genesis-entity-id',
            deployer: '0x1234567890abcdef1234567890abcdef12345678',
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
        )
      })

      it('should return ok', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.DEPLOYMENT)
      })
    })

    describe('and the deployment has an empty contentServerUrls array', () => {
      let event: DeploymentToSqs
      let entity: Entity

      beforeEach(() => {
        event = createDeploymentEvent('genesis-entity-id', [])
        entity = createEntity({ id: 'genesis-entity-id', pointers: ['0,0'] })
        db.getRegistryById.mockResolvedValue(null)
        worlds.isWorldDeployment.mockReturnValue(false)
        catalyst.getEntityById.mockResolvedValue(entity)
        registry.persistAndRotateStates.mockResolvedValue(undefined as any)
      })

      it('should not reject it and should fetch from the default catalyst with no override', async () => {
        await handler.handle(event)

        expect(catalyst.getEntityById).toHaveBeenCalledWith('genesis-entity-id', {
          overrideContentServerUrl: undefined
        })
      })
    })

    describe('and the deployment is a Genesis City scene with a content server URL', () => {
      let event: DeploymentToSqs
      let entity: Entity

      beforeEach(() => {
        event = createDeploymentEvent('genesis-entity-id', ['https://peer.decentraland.org/content'])
        entity = createEntity({ id: 'genesis-entity-id' })
        db.getRegistryById.mockResolvedValue(null)
        worlds.isWorldDeployment.mockReturnValue(false)
        catalyst.getEntityById.mockResolvedValue(entity)
        registry.persistAndRotateStates.mockResolvedValue(undefined as any)
      })

      it('should fetch the entity from the catalyst with the override URL', async () => {
        await handler.handle(event)

        expect(catalyst.getEntityById).toHaveBeenCalledWith('genesis-entity-id', {
          overrideContentServerUrl: 'https://peer.decentraland.org/content'
        })
      })
    })

    describe('and the deployment is a world scene', () => {
      let event: DeploymentToSqs
      let entity: Entity

      beforeEach(() => {
        event = createDeploymentEvent('world-entity-id', ['https://worlds-content-server.decentraland.org/world'])
        entity = createEntity({ id: 'world-entity-id', pointers: ['myworld.dcl.eth:0,0'] })
        db.getRegistryById.mockResolvedValue(null)
        worlds.isWorldDeployment.mockReturnValue(true)
        worlds.getWorld.mockResolvedValue(entity)
        registry.persistAndRotateStates.mockResolvedValue(undefined as any)
      })

      it('should fetch the entity from the worlds content server', async () => {
        await handler.handle(event)

        expect(worlds.getWorld).toHaveBeenCalledWith(
          'world-entity-id',
          'https://worlds-content-server.decentraland.org/world'
        )
      })

      it('should persist the registry with default bundle statuses', async () => {
        await handler.handle(event)

        expect(registry.persistAndRotateStates).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'world-entity-id',
            deployer: '0x1234567890abcdef1234567890abcdef12345678',
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
        )
      })

      it('should return ok', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.DEPLOYMENT)
      })
    })

    describe('and the deployment points at a content server that is not an allowed catalyst', () => {
      let event: DeploymentToSqs

      beforeEach(() => {
        event = createDeploymentEvent('genesis-entity-id', ['https://169.254.169.254/latest/meta-data/'])
        db.getRegistryById.mockResolvedValue(null)
        worlds.isWorldDeployment.mockReturnValue(false)
      })

      it('should skip the event without fetching the entity (SSRF guard)', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.DEPLOYMENT)
        expect(catalyst.getEntityById).not.toHaveBeenCalled()
        expect(registry.persistAndRotateStates).not.toHaveBeenCalled()
      })
    })

    describe('and a later contentServerUrl entry is not an allowed catalyst', () => {
      let event: DeploymentToSqs

      beforeEach(() => {
        // First entry is allowlisted, second is not — every entry must be checked.
        event = createDeploymentEvent('genesis-entity-id', [
          'https://peer.decentraland.org/content',
          'https://evil.internal/ssrf'
        ])
        db.getRegistryById.mockResolvedValue(null)
        worlds.isWorldDeployment.mockReturnValue(false)
      })

      it('should skip the event even though the first URL is allowlisted', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(catalyst.getEntityById).not.toHaveBeenCalled()
        expect(registry.persistAndRotateStates).not.toHaveBeenCalled()
      })
    })

    describe('and the entity is not found', () => {
      let event: DeploymentToSqs

      beforeEach(() => {
        event = createDeploymentEvent('not-found-entity-id')
        db.getRegistryById.mockResolvedValue(null)
        worlds.isWorldDeployment.mockReturnValue(false)
        catalyst.getEntityById.mockResolvedValue(null)
      })

      it('should return an error', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual(['Entity with id not-found-entity-id was not found'])
        expect(result.handlerName).toBe(EventHandlerName.DEPLOYMENT)
      })

      it('should not persist anything', async () => {
        await handler.handle(event)

        expect(registry.persistAndRotateStates).not.toHaveBeenCalled()
      })
    })

    describe('and an unexpected error occurs', () => {
      let event: DeploymentToSqs

      beforeEach(() => {
        event = createDeploymentEvent('error-entity-id')
        db.getRegistryById.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should return an error with the error message', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual(['Database connection failed'])
        expect(result.handlerName).toBe(EventHandlerName.DEPLOYMENT)
      })
    })
  })
})
