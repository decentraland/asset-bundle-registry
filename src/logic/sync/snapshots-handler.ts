import { SnapshotMetadata } from '@dcl/snapshots-fetcher/dist/types'
import { AppComponents, IProfilesSynchronizerComponent, Sync } from '../../types'
import { getDeployedEntitiesStreamFromSnapshot } from '@dcl/snapshots-fetcher'
import { SNAPSHOT_DOWNLOAD_FOLDER } from '../../types/constants'
import { EntityType } from '@dcl/schemas'

export async function createSnapshotsHandlerComponent({
  config,
  logs,
  metrics,
  fetch,
  db,
  profileSanitizer,
  entityPersistent,
  snapshotContentStorage
}: Pick<
  AppComponents,
  'config' | 'logs' | 'metrics' | 'fetch' | 'db' | 'profileSanitizer' | 'entityPersistent' | 'snapshotContentStorage'
>): Promise<IProfilesSynchronizerComponent> {
  const CATALYST_LOAD_BALANCER = await config.requireString('CATALYST_LOADBALANCER_HOST')
  const logger = logs.getLogger('snapshots-handler')

  async function fetchSnapshotsToProcess(currentTime: number): Promise<SnapshotMetadata[]> {
    const response = await fetch.fetch(`${CATALYST_LOAD_BALANCER}/content/snapshots`)

    if (!response.ok) {
      logger.error('Failed to fetch snapshot metadata', { status: response.status, statusText: response.statusText })
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const snapshots: SnapshotMetadata[] = await response.json()

    logger.info(`Snapshots fetched, will process those after ${new Date(currentTime).toISOString()}`, {
      count: snapshots.length,
      oldestSnapshot: new Date(Math.min(...snapshots.map((s) => s.timeRange.initTimestamp))).toISOString(),
      newestSnapshot: new Date(Math.max(...snapshots.map((s) => s.timeRange.endTimestamp))).toISOString()
    })

    const sortedSnapshots = snapshots.sort((a, b) => a.timeRange.initTimestamp - b.timeRange.initTimestamp)
    const snapshotsToProcess = sortedSnapshots.filter((s) => s.timeRange.initTimestamp < currentTime)

    return snapshotsToProcess
  }

  async function processSnapshots(snapshots: SnapshotMetadata[], abortSignal: AbortSignal): Promise<number> {
    logger.info(`Processing ${snapshots.length} snapshots`)
    let lastProcessedTimestamp = 0

    for (const snapshot of snapshots) {
      if (abortSignal.aborted) {
        logger.info('Abort signal received, stopping processing snapshots')
        break
      }

      const alreadyProcessed = await db.isSnapshotProcessed(snapshot.hash)
      if (alreadyProcessed) {
        logger.info('Skipping already processed snapshot', { hash: snapshot.hash })
        lastProcessedTimestamp = Math.max(lastProcessedTimestamp, snapshot.timeRange.endTimestamp)
        continue
      }

      logger.info(`Processing snapshot ${snapshot.hash}`, {
        timeRangeInit: new Date(snapshot.timeRange.initTimestamp).toISOString(),
        timeRangeEnd: new Date(snapshot.timeRange.endTimestamp).toISOString()
      })

      const entitiesStream = getDeployedEntitiesStreamFromSnapshot(
        {
          logs,
          metrics,
          storage: snapshotContentStorage
        },
        {
          fromTimestamp: Math.max(lastProcessedTimestamp, snapshot.timeRange.initTimestamp),
          tmpDownloadFolder: SNAPSHOT_DOWNLOAD_FOLDER,
          requestRetryWaitTime: 1000,
          requestMaxRetries: 5,
          deleteSnapshotAfterUsage: true
        },
        snapshot.hash,
        new Set([CATALYST_LOAD_BALANCER + '/content'])
      )

      const extractedProfiles: Array<Sync.ProfileDeployment> = []
      for await (const entity of entitiesStream) {
        if (entity.entityType === EntityType.PROFILE.toLowerCase()) {
          logger.info('Processing profile', { entityId: entity.entityId, pointer: entity.pointers[0] })
          extractedProfiles.push({
            entityId: entity.entityId,
            pointer: entity.pointers[0],
            timestamp: entity.entityTimestamp,
            authChain: entity.authChain
          })

          lastProcessedTimestamp = Math.max(lastProcessedTimestamp, entity.entityTimestamp)
        }
      }

      logger.info(`${extractedProfiles.length} profiles extracted from snapshot ${snapshot.hash}`)

      // Process profiles in chunks to avoid overwhelming the Catalyst API
      const CHUNK_SIZE = 1000
      for (let i = 0; i < extractedProfiles.length; i += CHUNK_SIZE) {
        const chunk = extractedProfiles.slice(i, i + CHUNK_SIZE)
        logger.debug(
          `Processing profile chunk ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(extractedProfiles.length / CHUNK_SIZE)}`,
          {
            chunkSize: chunk.length,
            totalProfiles: extractedProfiles.length
          }
        )

        const profilesFetched = await profileSanitizer.sanitizeProfiles(chunk, (profile) => {
          return db.insertFailedProfileFetch({
            entityId: profile.entityId,
            pointer: profile.pointer,
            timestamp: profile.timestamp,
            authChain: profile.authChain,
            firstFailedAt: Date.now(),
            retryCount: 0,
            errorMessage: 'Profile not found in Catalyst response'
          })
        })
        await Promise.all(profilesFetched.map((p) => entityPersistent.persistEntity(p)))
      }
      await db.markSnapshotProcessed(snapshot.hash)
      lastProcessedTimestamp = Math.max(lastProcessedTimestamp, snapshot.timeRange.endTimestamp)
    }

    return lastProcessedTimestamp
  }

  async function syncProfiles(fromTimestamp: number, abortSignal: AbortSignal): Promise<number> {
    logger.info('Syncing profiles from snapshots', { fromTimestamp })
    let lastProcessedTimestamp = fromTimestamp

    try {
      const snapshots = await fetchSnapshotsToProcess(fromTimestamp)

      if (snapshots.length === 0) {
        logger.info('No snapshots to process', { fromTimestamp })
        return fromTimestamp
      }

      lastProcessedTimestamp = await processSnapshots(snapshots, abortSignal)
      return lastProcessedTimestamp
    } catch (error: any) {
      logger.error('Error syncing profiles from snapshots', { error: error.message })
    } finally {
      return lastProcessedTimestamp
    }
  }

  return {
    syncProfiles
  }
}
