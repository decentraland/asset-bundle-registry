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
 * Handles world scene undeployment events by marking target entities and their
 * fallbacks as OBSOLETE in a single atomic database operation.
 *
 * The undeployment process:
 * 1. Validates the incoming undeployment message
 * 2. Marks all target entities as OBSOLETE
 * 3. Marks any FALLBACK registries sharing pointers with target entities as OBSOLETE
 *
 * @param components Required components: db, logs
 * @returns IEventHandlerComponent implementation for WorldScenesUndeploymentEvent
 */
export const createUndeploymentEventHandler = ({
  db,
  logs
}: Pick<AppComponents, 'db' | 'logs'>): IEventHandlerComponent<WorldScenesUndeploymentEvent> => {
  const HANDLER_NAME = EventHandlerName.UNDEPLOYMENT
  const logger = logs.getLogger('undeployment-handler')

  return {
    /**
     * Handles a world undeployment event.
     *
     * Marks the specified entities and their fallbacks as OBSOLETE atomically.
     * This ensures that after undeployment, the pointer has no active content.
     *
     * @param event - The undeployment event containing entity IDs to undeploy
     * @returns EventHandlerResult indicating success or failure
     */
    handle: async (event: WorldScenesUndeploymentEvent): Promise<EventHandlerResult> => {
      const entityIds = event.metadata.entityIds

      try {
        logger.info('Processing undeployment', { entityIds: entityIds.join(', ') })

        const updatedCount = await db.undeployRegistries(entityIds)

        logger.info('Undeployment complete', {
          requestedEntityIds: entityIds.join(', '),
          totalUpdatedRegistries: updatedCount
        })

        return { ok: true, handlerName: HANDLER_NAME }
      } catch (error: any) {
        logger.error('Failed to process undeployment', {
          entityIds: entityIds.join(', '),
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
