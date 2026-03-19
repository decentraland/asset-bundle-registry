import { EntityType } from '@dcl/schemas'
import { getDeployedEntitiesStreamFromPointerChanges } from '@dcl/snapshots-fetcher'
import { AppComponents, IProfilesSynchronizerComponent } from '../../types'
import { validateEntity } from '../entity-validator'

export async function createPointerChangesHandlerComponent({
  config,
  logs,
  fetch,
  db,
  profileSanitizer,
  entityPersister,
  entityDeploymentTracker,
  refreshableFeatures
}: Pick<
  AppComponents,
  | 'config'
  | 'logs'
  | 'fetch'
  | 'db'
  | 'profileSanitizer'
  | 'entityPersister'
  | 'entityDeploymentTracker'
  | 'refreshableFeatures'
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

    let lastProfileTimestampProcessed = 0
    const iterator = entitiesStream[Symbol.asyncIterator]()

    try {
      while (!abortSignal.aborted) {
        const result = await iterator.next()
        if (result.done || !result.value) {
          break
        }

        const entity = result.value

        if (entity.entityType !== EntityType.PROFILE) {
          continue
        }

        if (entityDeploymentTracker.hasBeenProcessed(entity.entityId)) {
          continue
        }

        logger.info('Streamed profile, processing it', {
          entityId: entity.entityId,
          pointer: entity.pointers[0]
        })

        const maliciousAddresses = await refreshableFeatures.getMaliciousAddresses()
        if (!maliciousAddresses || !maliciousAddresses.includes(entity.pointers[0].toLowerCase())) {
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

          const validationResult = validateEntity(sanitizedProfile[0], logger)
          if (!validationResult.ok) {
            logger.warn('Skipping invalid profile from pointer changes', {
              entityId: sanitizedProfile[0].id,
              errors: JSON.stringify(validationResult.errors)
            })
            continue
          }

          await entityPersister.persistEntity(sanitizedProfile[0])
        } else {
          logger.info('Skipping profile update because it is marked as malicious', {
            entityId: entity.entityId,
            pointer: entity.pointers[0]
          })
        }

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
