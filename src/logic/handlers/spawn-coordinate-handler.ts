import { Events, WorldSpawnCoordinateSetEvent } from '@dcl/schemas'
import {
  AppComponents,
  DEFAULT_EVENT_CONTEXT,
  EventContext,
  IEventHandlerComponent,
  EventHandlerName,
  EventHandlerResult
} from '../../types'

/**
 * Type guard to validate if a message is a WorldSpawnCoordinateSetEvent.
 *
 * @param event - The event to validate
 * @returns True if the event is a valid WorldSpawnCoordinateSetEvent
 */
function isWorldSpawnCoordinateSetEvent(event: any): event is WorldSpawnCoordinateSetEvent {
  return event && event.type === Events.Type.WORLD && event.subType === Events.SubType.Worlds.WORLD_SPAWN_COORDINATE_SET
}

/**
 * Creates the Spawn Coordinate Event Handler component.
 *
 * Handles world spawn coordinate set events by updating the spawn coordinate
 * for a world. The coordinate is stored with is_user_set = true to indicate
 * that it was explicitly set by the user.
 *
 * @param components Required components: coordinates, logs
 * @returns IEventHandlerComponent implementation for WorldSpawnCoordinateSetEvent
 */
export const createSpawnCoordinateEventHandler = ({
  coordinates,
  logs
}: Pick<AppComponents, 'logs' | 'coordinates'>): IEventHandlerComponent<WorldSpawnCoordinateSetEvent> => {
  const HANDLER_NAME = EventHandlerName.SPAWN_COORDINATE
  const logger = logs.getLogger('spawn-coordinate-handler')

  return {
    /**
     * Handles a world spawn coordinate set event.
     *
     * Sets the spawn coordinate for a world with is_user_set = true.
     * The coordinate is stored even if it's not currently valid for the world shape,
     * as it may become valid when matching scenes are deployed.
     * Uses event timestamp for conflict resolution to prevent race conditions.
     *
     * @param event - The spawn coordinate set event
     * @param context - Message context; ignored when the world is served by another source server
     * @returns EventHandlerResult indicating success or failure
     */
    handle: async (
      event: WorldSpawnCoordinateSetEvent,
      context: EventContext = DEFAULT_EVENT_CONTEXT
    ): Promise<EventHandlerResult> => {
      const { name: worldName, newCoordinate, oldCoordinate } = event.metadata
      const eventTimestamp = event.timestamp

      try {
        logger.info('Processing spawn coordinate set', {
          worldName,
          oldCoordinate: oldCoordinate ? `${oldCoordinate.x},${oldCoordinate.y}` : 'none',
          newCoordinate: `${newCoordinate.x},${newCoordinate.y}`,
          eventTimestamp
        })

        await coordinates.setUserSpawnCoordinate(
          worldName,
          {
            x: newCoordinate.x,
            y: newCoordinate.y
          },
          eventTimestamp,
          context.sourceContentServerUrl
        )

        logger.info('Spawn coordinate set complete', {
          worldName,
          coordinate: `${newCoordinate.x},${newCoordinate.y}`,
          eventTimestamp
        })

        return { ok: true, handlerName: HANDLER_NAME }
      } catch (error: any) {
        logger.error('Failed to process spawn coordinate set', {
          worldName,
          coordinate: `${newCoordinate.x},${newCoordinate.y}`,
          eventTimestamp,
          error: error?.message || 'Unexpected processor failure',
          stack: JSON.stringify(error?.stack)
        })

        return {
          ok: false,
          errors: [error?.message || 'Unexpected processor failure'],
          handlerName: HANDLER_NAME
        }
      }
    },

    /**
     * Determines if this handler can process the given event.
     *
     * @param event - The event to check
     * @returns True if the event is a valid WorldSpawnCoordinateSetEvent
     */
    canHandle: (event: any): boolean => {
      return isWorldSpawnCoordinateSetEvent(event)
    },

    name: HANDLER_NAME
  }
}
