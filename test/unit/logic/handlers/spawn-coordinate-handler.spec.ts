import { Events, WorldSpawnCoordinateSetEvent } from '@dcl/schemas'
import { createSpawnCoordinateEventHandler } from '../../../../src/logic/handlers/spawn-coordinate-handler'
import { EventHandlerName } from '../../../../src/types'
import { createCoordinatesMockComponent } from '../../mocks/coordinates'
import { createLogMockComponent } from '../../mocks/logs'

describe('when handling spawn coordinate set events', () => {
  const createSpawnCoordinateSetEvent = (
    name: string,
    newCoordinate: { x: number; y: number },
    oldCoordinate: { x: number; y: number } | null = null
  ): WorldSpawnCoordinateSetEvent => ({
    type: Events.Type.WORLD,
    subType: Events.SubType.Worlds.WORLD_SPAWN_COORDINATE_SET,
    key: 'test-key',
    timestamp: Date.now(),
    metadata: {
      name,
      newCoordinate,
      oldCoordinate
    }
  })

  describe('and calling canHandle', () => {
    let logs: ReturnType<typeof createLogMockComponent>
    let coordinates: ReturnType<typeof createCoordinatesMockComponent>
    let handler: ReturnType<typeof createSpawnCoordinateEventHandler>

    beforeEach(() => {
      logs = createLogMockComponent()
      coordinates = createCoordinatesMockComponent()
      handler = createSpawnCoordinateEventHandler({ logs, coordinates })
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the event is a valid WorldSpawnCoordinateSetEvent', () => {
      let event: WorldSpawnCoordinateSetEvent

      beforeEach(() => {
        event = createSpawnCoordinateSetEvent('test-world', { x: 5, y: 10 })
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
          subType: Events.SubType.Worlds.WORLD_SPAWN_COORDINATE_SET,
          key: 'test-key',
          timestamp: Date.now(),
          metadata: { name: 'test-world', newCoordinate: { x: 0, y: 0 }, oldCoordinate: null }
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
          subType: Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT,
          key: 'test-key',
          timestamp: Date.now(),
          metadata: { name: 'test-world', newCoordinate: { x: 0, y: 0 }, oldCoordinate: null }
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
    let coordinates: ReturnType<typeof createCoordinatesMockComponent>
    let handler: ReturnType<typeof createSpawnCoordinateEventHandler>

    beforeEach(() => {
      logs = createLogMockComponent()
      coordinates = createCoordinatesMockComponent()
      handler = createSpawnCoordinateEventHandler({ logs, coordinates })
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the spawn coordinate set is successful', () => {
      let event: WorldSpawnCoordinateSetEvent

      beforeEach(() => {
        event = createSpawnCoordinateSetEvent('test-world', { x: 5, y: 10 }, { x: 0, y: 0 })
        coordinates.setUserSpawnCoordinate.mockResolvedValue(undefined)
      })

      it('should store the user spawn coordinate for the world', async () => {
        await handler.handle(event)

        expect(coordinates.setUserSpawnCoordinate).toHaveBeenCalledWith('test-world', { x: 5, y: 10 }, event.timestamp)
      })

      it('should return ok', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.SPAWN_COORDINATE)
      })
    })

    describe('and setting spawn coordinate without previous value', () => {
      let event: WorldSpawnCoordinateSetEvent

      beforeEach(() => {
        event = createSpawnCoordinateSetEvent('new-world', { x: 3, y: 7 }, null)
        coordinates.setUserSpawnCoordinate.mockResolvedValue(undefined)
      })

      it('should store the user spawn coordinate for the world', async () => {
        await handler.handle(event)

        expect(coordinates.setUserSpawnCoordinate).toHaveBeenCalledWith('new-world', { x: 3, y: 7 }, event.timestamp)
      })

      it('should return ok', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.SPAWN_COORDINATE)
      })
    })

    describe('and the coordinates component fails', () => {
      let event: WorldSpawnCoordinateSetEvent

      beforeEach(() => {
        event = createSpawnCoordinateSetEvent('test-world', { x: 5, y: 10 })
        coordinates.setUserSpawnCoordinate.mockRejectedValue(new Error('Database connection failed'))
      })

      it('should return an error with the error message', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual(['Database connection failed'])
        expect(result.handlerName).toBe(EventHandlerName.SPAWN_COORDINATE)
      })
    })

    describe('and an unexpected error without a message occurs', () => {
      let event: WorldSpawnCoordinateSetEvent

      beforeEach(() => {
        event = createSpawnCoordinateSetEvent('test-world', { x: 5, y: 10 })
        coordinates.setUserSpawnCoordinate.mockRejectedValue({})
      })

      it('should return a generic error message', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(false)
        expect(result.errors).toEqual(['Unexpected processor failure'])
        expect(result.handlerName).toBe(EventHandlerName.SPAWN_COORDINATE)
      })
    })
  })
})
