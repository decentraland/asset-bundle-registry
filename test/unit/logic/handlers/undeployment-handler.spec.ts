import { Events, WorldScenesUndeploymentEvent } from '@dcl/schemas'
import { createUndeploymentEventHandler } from '../../../../src/logic/handlers/undeployment-handler'
import { EventHandlerName } from '../../../../src/types'
import { createLogMockComponent } from '../../mocks/logs'
import { createRegistryMockComponent } from '../../mocks/registry'

describe('when handling undeployment events', () => {
  const createUndeploymentEvent = (entityIds: string[]): WorldScenesUndeploymentEvent => ({
    type: Events.Type.WORLD,
    subType: Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT,
    key: 'test-key',
    timestamp: Date.now(),
    metadata: {
      entityIds
    }
  })

  describe('and calling canHandle', () => {
    let logs: ReturnType<typeof createLogMockComponent>
    let registry: ReturnType<typeof createRegistryMockComponent>
    let handler: ReturnType<typeof createUndeploymentEventHandler>

    beforeEach(() => {
      logs = createLogMockComponent()
      registry = createRegistryMockComponent()
      handler = createUndeploymentEventHandler({ logs, registry })
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the event is a valid WorldScenesUndeploymentEvent', () => {
      let event: WorldScenesUndeploymentEvent

      beforeEach(() => {
        event = createUndeploymentEvent(['entity-1', 'entity-2'])
      })

      it('should return true', () => {
        expect(handler.canHandle(event)).toBe(true)
      })
    })

    describe('and the event has the wrong type', () => {
      let invalidEvent: any

      beforeEach(() => {
        invalidEvent = {
          type: Events.Type.ASSET_BUNDLE,
          subType: Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT,
          key: 'test-key',
          timestamp: Date.now(),
          metadata: { entityIds: ['entity-1'] }
        }
      })

      it('should return false', () => {
        expect(handler.canHandle(invalidEvent)).toBe(false)
      })
    })

    describe('and the event has the wrong subType', () => {
      let invalidEvent: any

      beforeEach(() => {
        invalidEvent = {
          type: Events.Type.WORLD,
          subType: Events.SubType.AssetBundle.CONVERTED,
          key: 'test-key',
          timestamp: Date.now(),
          metadata: { entityIds: ['entity-1'] }
        }
      })

      it('should return false', () => {
        expect(handler.canHandle(invalidEvent)).toBe(false)
      })
    })

    describe('and the event is null', () => {
      it('should return a falsy value', () => {
        expect(handler.canHandle(null)).toBeFalsy()
      })
    })

    describe('and the event is undefined', () => {
      it('should return a falsy value', () => {
        expect(handler.canHandle(undefined)).toBeFalsy()
      })
    })
  })

  describe('and calling handle', () => {
    let logs: ReturnType<typeof createLogMockComponent>
    let registry: ReturnType<typeof createRegistryMockComponent>
    let handler: ReturnType<typeof createUndeploymentEventHandler>

    beforeEach(() => {
      logs = createLogMockComponent()
      registry = createRegistryMockComponent()
      handler = createUndeploymentEventHandler({ logs, registry })
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the undeployment is successful', () => {
      let event: WorldScenesUndeploymentEvent

      beforeEach(() => {
        event = createUndeploymentEvent(['entity-1', 'entity-2'])
        registry.undeployWorldScenes.mockResolvedValue({
          undeployedCount: 2,
          worldName: null
        })
      })

      it('should undeploy the world scenes for the given entity IDs', async () => {
        await handler.handle(event)

        expect(registry.undeployWorldScenes).toHaveBeenCalledWith(['entity-1', 'entity-2'], event.timestamp)
      })

      it('should return ok', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.UNDEPLOYMENT)
      })
    })

    describe('and the undeployment affects a world', () => {
      let event: WorldScenesUndeploymentEvent

      beforeEach(() => {
        event = createUndeploymentEvent(['entity-1'])
        registry.undeployWorldScenes.mockResolvedValue({
          undeployedCount: 1,
          worldName: 'test-world'
        })
      })

      it('should return ok', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.UNDEPLOYMENT)
      })
    })

    describe('and the undeployment affects fallback registries as well', () => {
      let event: WorldScenesUndeploymentEvent

      beforeEach(() => {
        event = createUndeploymentEvent(['entity-1'])
        registry.undeployWorldScenes.mockResolvedValue({
          undeployedCount: 3,
          worldName: 'test-world'
        })
      })

      it('should return ok', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.UNDEPLOYMENT)
      })
    })

    describe('and no entities are found to undeploy', () => {
      let event: WorldScenesUndeploymentEvent

      beforeEach(() => {
        event = createUndeploymentEvent(['non-existent-entity'])
        registry.undeployWorldScenes.mockResolvedValue({
          undeployedCount: 0,
          worldName: null
        })
      })

      it('should return ok', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.UNDEPLOYMENT)
      })
    })

    describe('and the registry operation fails', () => {
      let event: WorldScenesUndeploymentEvent

      beforeEach(() => {
        event = createUndeploymentEvent(['entity-1'])
        registry.undeployWorldScenes.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should return an error with the error message', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual(['Database connection failed'])
        expect(result.handlerName).toBe(EventHandlerName.UNDEPLOYMENT)
      })
    })

    describe('and an unexpected error without a message occurs', () => {
      let event: WorldScenesUndeploymentEvent

      beforeEach(() => {
        event = createUndeploymentEvent(['entity-1'])
        registry.undeployWorldScenes.mockRejectedValue({})
      })

      it('should return a generic error message', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual(['Unexpected processor failure'])
        expect(result.handlerName).toBe(EventHandlerName.UNDEPLOYMENT)
      })
    })
  })
})
