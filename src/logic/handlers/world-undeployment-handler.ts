import { Events, WorldUndeploymentEvent } from '@dcl/schemas'
import { AppComponents, IEventHandlerComponent, EventHandlerName, EventHandlerResult } from '../../types'

/**
 * Type guard to validate if a message is a WorldUndeploymentEvent.
 *
 * @param event - The event to validate
 * @returns True if the event is a valid WorldUndeploymentEvent
 */
function isWorldUndeploymentEvent(event: any): event is WorldUndeploymentEvent {
  return event && event.type === Events.Type.WORLD && event.subType === Events.SubType.Worlds.WORLD_UNDEPLOYMENT
}

/**
 * Creates the World Undeployment Event Handler component.
 *
 * Handles full world undeployment events by delegating to the registry component
 * which marks all registries belonging to the world as OBSOLETE and recalculates
 * spawn coordinates.
 *
 * @param components Required components: registry, logs
 * @returns IEventHandlerComponent implementation for WorldUndeploymentEvent
 */
export const createWorldUndeploymentEventHandler = ({
  registry,
  logs
}: Pick<AppComponents, 'logs' | 'registry'>): IEventHandlerComponent<WorldUndeploymentEvent> => {
  const HANDLER_NAME = EventHandlerName.WORLD_UNDEPLOYMENT
  const logger = logs.getLogger('world-undeployment-handler')

  return {
    /**
     * Handles a full world undeployment event.
     *
     * Delegates to the registry component which finds all registries for the world,
     * marks them as OBSOLETE, and recalculates spawn coordinates.
     *
     * @param event - The undeployment event containing the world name
     * @returns EventHandlerResult indicating success or failure
     */
    handle: async (event: WorldUndeploymentEvent): Promise<EventHandlerResult> => {
      const worldName = event.metadata.worldName
      const eventTimestamp = event.timestamp

      try {
        logger.info('Processing world undeployment', { worldName, eventTimestamp })

        const result = await registry.undeployWorld(worldName, eventTimestamp)

        logger.info('World undeployment complete', {
          worldName,
          totalUpdatedRegistries: result.undeployedCount,
          eventTimestamp
        })

        return { ok: true, handlerName: HANDLER_NAME }
      } catch (error: any) {
        logger.error('Failed to process world undeployment', {
          worldName,
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
     * @returns True if the event is a valid WorldUndeploymentEvent
     */
    canHandle: (event: any): boolean => {
      return isWorldUndeploymentEvent(event)
    },

    name: HANDLER_NAME
  }
}
