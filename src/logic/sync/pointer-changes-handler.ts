import { EntityType } from '@dcl/schemas'
import { getDeployedEntitiesStreamFromPointerChanges } from '@dcl/snapshots-fetcher'
import { AppComponents, IProfilesSynchronizerComponent } from '../../types'

export async function createPointerChangesHandlerComponent({
  config,
  logs,
  fetch,
  db,
  profileSanitizer,
  entityPersister,
  entityDeploymentTracker
}: Pick<
  AppComponents,
  'config' | 'logs' | 'fetch' | 'db' | 'profileSanitizer' | 'entityPersister' | 'entityDeploymentTracker'
>): Promise<IProfilesSynchronizerComponent> {
  const logger = logs.getLogger('pointer-changes-handler')
  const CATALYST_LOAD_BALANCER = await config.requireString('CATALYST_LOADBALANCER_HOST')

  async function syncProfiles(fromTimestamp: number, abortSignal: AbortSignal): Promise<number> {
    const entitiesStream = getDeployedEntitiesStreamFromPointerChanges(
      {
        fetcher: fetch,
        logs: logs
      },
      {
        fromTimestamp: fromTimestamp,
        pointerChangesWaitTime: 0 // we want to control the loop
      },
      CATALYST_LOAD_BALANCER + '/content'
    )

    let lastEntityIdHandled = ''
    let lastProfileTimestampProcessed = 0
    const iterator = entitiesStream[Symbol.asyncIterator]()

    try {
      while (!abortSignal.aborted) {
        const result = await iterator.next()
        if (result.done || !result.value || result.value.entityId === lastEntityIdHandled) {
          break
        }

        const entity = result.value

        if (entity.entityType !== EntityType.PROFILE.toLowerCase()) {
          continue
        }

        logger.info("Streamed profile, won't be processed if already processed", {
          entityId: entity.entityId,
          pointer: entity.pointers[0]
        })

        if (entityDeploymentTracker.hasBeenProcessed(entity.entityId)) {
          continue
        }

        const sanitizedProfile = await profileSanitizer.sanitizeProfiles(
          [
            {
              entityId: entity.entityId,
              pointer: entity.pointers[0],
              timestamp: entity.entityTimestamp,
              authChain: entity.authChain
            }
          ],
          (profile) => {
            return db.insertFailedProfileFetch({
              entityId: profile.entityId,
              pointer: profile.pointer,
              timestamp: profile.timestamp,
              authChain: profile.authChain,
              firstFailedAt: Date.now(),
              retryCount: 0,
              errorMessage: 'Profile not found in Catalyst response'
            })
          }
        )

        if (sanitizedProfile.length === 0) {
          continue
        }

        await entityPersister.persistEntity(sanitizedProfile[0])
        lastEntityIdHandled = entity.entityId
        lastProfileTimestampProcessed = entity.entityTimestamp
      }
    } finally {
      if (iterator.return) {
        await iterator.return()
      }
    }

    return Math.max(lastProfileTimestampProcessed, fromTimestamp)
  }

  return {
    syncProfiles
  }
}
