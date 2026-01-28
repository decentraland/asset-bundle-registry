import { Events, WorldScenesUndeploymentEvent } from '@dcl/schemas'
import { createUndeploymentEventHandler } from '../../../../src/logic/handlers/undeployment-handler'
import { EventHandlerName } from '../../../../src/types'
import { createDbMockComponent } from '../../mocks/db'
import { createLogMockComponent } from '../../mocks/logs'

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
    let db: ReturnType<typeof createDbMockComponent>
    let handler: ReturnType<typeof createUndeploymentEventHandler>

    beforeEach(() => {
      logs = createLogMockComponent()
      db = createDbMockComponent()
      handler = createUndeploymentEventHandler({ logs, db })
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
    let db: ReturnType<typeof createDbMockComponent>
    let handler: ReturnType<typeof createUndeploymentEventHandler>

    beforeEach(() => {
      logs = createLogMockComponent()
      db = createDbMockComponent()
      handler = createUndeploymentEventHandler({ logs, db })
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    describe('and the undeployment is successful', () => {
      let event: WorldScenesUndeploymentEvent

      beforeEach(() => {
        event = createUndeploymentEvent(['entity-1', 'entity-2'])
        db.undeployRegistries.mockResolvedValue(2)
      })

      it('should call undeployRegistries with the entity IDs', async () => {
        await handler.handle(event)

        expect(db.undeployRegistries).toHaveBeenCalledWith(['entity-1', 'entity-2'])
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
        db.undeployRegistries.mockResolvedValue(3)
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
        db.undeployRegistries.mockResolvedValue(0)
      })

      it('should return ok', async () => {
        const result = await handler.handle(event)

        expect(result.ok).toBe(true)
        expect(result.handlerName).toBe(EventHandlerName.UNDEPLOYMENT)
      })
    })

    describe('and the database operation fails', () => {
      let event: WorldScenesUndeploymentEvent

      beforeEach(() => {
        event = createUndeploymentEvent(['entity-1'])
        db.undeployRegistries.mockRejectedValue(new Error('Database connection failed'))
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
        db.undeployRegistries.mockRejectedValue({})
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
