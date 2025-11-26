import { AppComponents, IFailedProfilesRetrierComponent, Sync } from '../../types'

const FIFTY_ITEMS = 50

export function createFailedProfilesRetrierComponent({
  logs,
  db,
  profileSanitizer,
  entityPersistent
}: Pick<AppComponents, 'logs' | 'db' | 'profileSanitizer' | 'entityPersistent'>): IFailedProfilesRetrierComponent {
  const logger = logs.getLogger('failed-profiles-retrier')

  async function retryFailedProfiles(): Promise<void> {
    try {
      const failedDeployments: Sync.FailedProfileFetch[] = await db.getFailedProfileFetches(FIFTY_ITEMS)

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
          firstFailedAt: (profile as Sync.FailedProfileFetch).firstFailedAt,
          retryCount: (profile as Sync.FailedProfileFetch).retryCount + 1
        })
      })

      for (const sanitizedProfile of sanitizedProfiles) {
        await entityPersistent.persistEntity(sanitizedProfile)
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
