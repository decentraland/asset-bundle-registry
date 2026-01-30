import { Events, WorldScenesUndeploymentEvent } from '@dcl/schemas'
import { AppComponents, IEventHandlerComponent, EventHandlerName, EventHandlerResult } from '../../types'

/**
 * Type guard to validate if a message is a WorldScenesUndeploymentEvent.
 *
 * @param event - The event to validate
 * @returns True if the event is a valid WorldScenesUndeploymentEvent
 */
function isWorldScenesUndeploymentEvent(event: any): event is WorldScenesUndeploymentEvent {
  return event && event.type === Events.Type.WORLD && event.subType === Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT
}

/**
 * Creates the Undeployment Event Handler component.
 *
 * Handles world scene undeployment events by delegating to the registry component
 * which performs the operation atomically within a database transaction.
 *
 * The undeployment process:
 * 1. Validates the incoming undeployment message
 * 2. Delegates to registry.undeployWorldScenes which atomically:
 *    - Marks all target entities as OBSOLETE
 *    - Marks any FALLBACK registries sharing pointers as OBSOLETE
 *    - Recalculates spawn coordinates for affected worlds
 *
 * @param components Required components: registry, logs
 * @returns IEventHandlerComponent implementation for WorldScenesUndeploymentEvent
 */
export const createUndeploymentEventHandler = ({
  registry,
  logs
}: Pick<AppComponents, 'logs' | 'registry'>): IEventHandlerComponent<WorldScenesUndeploymentEvent> => {
  const HANDLER_NAME = EventHandlerName.UNDEPLOYMENT
  const logger = logs.getLogger('undeployment-handler')

  return {
    /**
     * Handles a world undeployment event.
     *
     * Delegates to the registry component which performs the entire operation
     * atomically within a database transaction, including spawn coordinate recalculation.
     * Uses event timestamp for conflict resolution to prevent race conditions.
     *
     * @param event - The undeployment event containing entity IDs to undeploy
     * @returns EventHandlerResult indicating success or failure
     */
    handle: async (event: WorldScenesUndeploymentEvent): Promise<EventHandlerResult> => {
      const entityIds = event.metadata.entityIds
      const eventTimestamp = event.timestamp

      try {
        logger.info('Processing undeployment', { entityIds: entityIds.join(', '), eventTimestamp })

        const result = await registry.undeployWorldScenes(entityIds, eventTimestamp)

        logger.info('Undeployment complete', {
          requestedEntityIds: entityIds.join(', '),
          totalUpdatedRegistries: result.undeployedCount,
          worldName: result.worldName || 'none',
          eventTimestamp
        })

        return { ok: true, handlerName: HANDLER_NAME }
      } catch (error: any) {
        logger.error('Failed to process undeployment', {
          entityIds: entityIds.join(', '),
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
     * @returns True if the event is a valid WorldScenesUndeploymentEvent
     */
    canHandle: (event: any): boolean => {
      return isWorldScenesUndeploymentEvent(event)
    },

    name: HANDLER_NAME
  }
}
