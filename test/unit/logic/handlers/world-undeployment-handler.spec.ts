import { Events, WorldUndeploymentEvent } from '@dcl/schemas'
import { createWorldUndeploymentEventHandler } from '../../../../src/logic/handlers/world-undeployment-handler'
import { EventHandlerName } from '../../../../src/types'
import { createLogMockComponent } from '../../mocks/logs'
import { createRegistryMockComponent } from '../../mocks/registry'

describe('when handling world undeployment events', () => {
  const createWorldUndeploymentEvent = (worldName: string): WorldUndeploymentEvent => ({
    type: Events.Type.WORLD,
    subType: Events.SubType.Worlds.WORLD_UNDEPLOYMENT,
    key: 'test-key',
    timestamp: Date.now(),
    metadata: {
      worldName
    }
  })

  describe('and calling canHandle', () => {
    let logs: ReturnType<typeof createLogMockComponent>
    let registry: ReturnType<typeof createRegistryMockComponent>
    let handler: ReturnType<typeof createWorldUndeploymentEventHandler>

    beforeEach(() => {
      logs = createLogMockComponent()
      registry = createRegistryMockComponent()
      handler = createWorldUndeploymentEventHandler({ logs, registry })
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the event is a valid WorldUndeploymentEvent', () => {
      let event: WorldUndeploymentEvent

      beforeEach(() => {
        event = createWorldUndeploymentEvent('test-world')
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
          subType: Events.SubType.Worlds.WORLD_UNDEPLOYMENT,
          key: 'test-key',
          timestamp: Date.now(),
          metadata: { worldName: 'test-world' }
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
          metadata: { worldName: 'test-world' }
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
    let handler: ReturnType<typeof createWorldUndeploymentEventHandler>

    beforeEach(() => {
      logs = createLogMockComponent()
      registry = createRegistryMockComponent()
      handler = createWorldUndeploymentEventHandler({ logs, registry })
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the world undeployment is successful', () => {
      let event: WorldUndeploymentEvent

      beforeEach(() => {
        event = createWorldUndeploymentEvent('test-world')
        registry.undeployWorld.mockResolvedValue({
          undeployedCount: 5,
          worldName: 'test-world'
        })
      })

      it('should undeploy the world by name and respond with a 200 status code', async () => {
        const result = await handler.handle(event)

        expect(registry.undeployWorld).toHaveBeenCalledWith('test-world', event.timestamp)
        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.WORLD_UNDEPLOYMENT)
      })
    })

    describe('and no registries are found for the world', () => {
      let event: WorldUndeploymentEvent

      beforeEach(() => {
        event = createWorldUndeploymentEvent('non-existent-world')
        registry.undeployWorld.mockResolvedValue({
          undeployedCount: 0,
          worldName: 'non-existent-world'
        })
      })

      it('should return ok', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.WORLD_UNDEPLOYMENT)
      })
    })

    describe('and the registry operation fails', () => {
      let event: WorldUndeploymentEvent

      beforeEach(() => {
        event = createWorldUndeploymentEvent('test-world')
        registry.undeployWorld.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should return an error with the error message', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual(['Database connection failed'])
        expect(result.handlerName).toBe(EventHandlerName.WORLD_UNDEPLOYMENT)
      })
    })

    describe('and an unexpected error without a message occurs', () => {
      let event: WorldUndeploymentEvent

      beforeEach(() => {
        event = createWorldUndeploymentEvent('test-world')
        registry.undeployWorld.mockRejectedValue({})
      })

      it('should return a generic error message', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual(['Unexpected processor failure'])
        expect(result.handlerName).toBe(EventHandlerName.WORLD_UNDEPLOYMENT)
      })
    })
  })
})
