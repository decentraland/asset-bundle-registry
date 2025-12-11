import { AppComponents, IFailedProfilesRetrierComponent, Sync } from '../../types'

const FIFTY_ITEMS = 50

export function createFailedProfilesRetrierComponent({
  logs,
  db,
  profileSanitizer,
  entityPersister
}: Pick<AppComponents, 'logs' | 'db' | 'profileSanitizer' | 'entityPersister'>): IFailedProfilesRetrierComponent {
  const logger = logs.getLogger('failed-profiles-retrier')

  async function retryFailedProfiles(abortSignal: AbortSignal): Promise<void> {
    try {
      if (abortSignal.aborted) {
        return
      }

      const failedDeployments: Sync.FailedProfileDbEntity[] = await db.getFailedProfileFetches(FIFTY_ITEMS)

      if (failedDeployments.length === 0) {
        logger.info('No failed profiles to retry')
        return
      }

      logger.info('Retrying failed profiles', { count: failedDeployments.length })
      const sanitizedProfiles = await profileSanitizer.sanitizeProfiles(failedDeployments, (profile) => {
        return db.insertFailedProfileFetch({
          entityId: profile.entityId,
          pointer: profile.pointer,
          timestamp: profile.timestamp,
          authChain: profile.authChain,
          firstFailedAt: (profile as Sync.FailedProfileDbEntity).firstFailedAt,
          retryCount: (profile as Sync.FailedProfileDbEntity).retryCount + 1
        })
      })

      for (const sanitizedProfile of sanitizedProfiles) {
        if (abortSignal.aborted) {
          return
        }
        await entityPersister.persistEntity(sanitizedProfile)
        await db.deleteFailedProfileFetch(sanitizedProfile.id)
      }
    } catch (error: any) {
      logger.error('Error retrying failed profiles', { error: error.message })
    }
  }

  return {
    retryFailedProfiles
  }
}
