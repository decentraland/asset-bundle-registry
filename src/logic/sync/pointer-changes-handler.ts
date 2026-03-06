import { EntityType } from '@dcl/schemas'
import { getDeployedEntitiesStreamFromPointerChanges } from '@dcl/snapshots-fetcher'
import { AppComponents, IProfilesSynchronizerComponent } from '../../types'

const BLOCKED_MALICIOUS_ADDRESSES = [
  '0x77d04e16ad353d79e29edaa2e8bbc6c9fd3a269f',
  '0xfc3433714673c1c510f15376752a8fc840c9fede',
  '0x7093013c79036e021d30f2840ba528c30a7dcd9d',
  '0x5baf0d8ff9635c2d4a95b5daf4694ee35b41b391'
]

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

        if (!BLOCKED_MALICIOUS_ADDRESSES.includes(entity.pointers[0])) {
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
