import { AppComponents, ISynchronizerComponent } from '../../types'
import { SYNC_STATE_KEY } from '../../types/constants'
import { withRetry } from '../../utils/async-utils'

const POINTER_CHANGES_POLL_INTERVAL_MS = 5000 // 5 seconds
const ONE_DAY_MS = 24 * 60 * 60 * 1000

// Genesis timestamp: When profiles were first introduced to Decentraland
const GENESIS_TIMESTAMP = 1577836800000 // 2020-01-01T00:00:00Z

export function createSynchronizerComponent(
  components: Pick<
    AppComponents,
    | 'logs'
    | 'config'
    | 'entityPersistent'
    | 'memoryStorage'
    | 'db'
    | 'snapshotsHandler'
    | 'pointerChangesHandler'
    | 'failedProfilesRetrier'
  >
): ISynchronizerComponent {
  const { logs, entityPersistent, memoryStorage, db, snapshotsHandler, pointerChangesHandler, failedProfilesRetrier } =
    components
  const logger = logs.getLogger('synchronizer')

  let running = false
  let abortController: AbortController | null = null

  async function loadLastCursor(): Promise<number> {
    let lastCursor: number = GENESIS_TIMESTAMP
    try {
      const storedCursor: number[] | undefined = await memoryStorage.get<number>(SYNC_STATE_KEY)
      if (storedCursor && storedCursor.length > 0) {
        lastCursor = storedCursor[0]
      } else {
        lastCursor = (await db.getLatestProfileTimestamp()) ?? lastCursor
      }
    } catch (error: any) {
      logger.warn('Failed to load last cursor', { error: error.message })
    } finally {
      return lastCursor
    }
  }

  async function waitForDatabaseReady(): Promise<void> {
    let isReady: boolean = false
    while (!isReady) {
      try {
        await db.getLatestProfileTimestamp()
        isReady = true
      } catch (error: any) {
        logger.info('Waiting for database migrations to complete', { error: error.message })
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
    // if service is starting from scratch, it will take a while until the migrations are done
    // TODO: handle database ready directly in the service lifecycle
    logger.info('Database is ready, synchronizer can start')
  }

  async function loop(
    callToLoop: (abortSignal: AbortSignal) => Promise<void>,
    abortSignal: AbortSignal
  ): Promise<void> {
    while (running && !abortSignal.aborted) {
      await callToLoop(abortSignal).catch((error) => {
        logger.error('Error in loop', { error: error.message })
      })
      if (!abortSignal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, POINTER_CHANGES_POLL_INTERVAL_MS))
      }
    }
    if (abortSignal.aborted) {
      logger.info('Loop aborted')
    }
  }

  async function syncProfiles(fromTimestamp: number, abortSignal: AbortSignal): Promise<void> {
    const isAWeekOld = Date.now() - fromTimestamp > ONE_DAY_MS * 7
    let cursor: number = fromTimestamp
    if (isAWeekOld && !abortSignal.aborted) {
      cursor = (await withRetry(async () => await snapshotsHandler.syncProfiles(fromTimestamp, abortSignal))) ?? cursor
      cursor && (await memoryStorage.set(SYNC_STATE_KEY, [cursor]))
    }

    void Promise.all([
      loop(async (signal) => {
        const newCursor = await pointerChangesHandler.syncProfiles(cursor, signal)
        if (newCursor && newCursor > cursor) {
          cursor = newCursor
          await memoryStorage.set(SYNC_STATE_KEY, [cursor])
        }
      }, abortSignal),
      loop(async (signal) => {
        await failedProfilesRetrier.retryFailedProfiles(signal)
      }, abortSignal)
    ])
  }

  async function start(): Promise<void> {
    logger.info('Starting profile synchronizer')
    running = true
    abortController = new AbortController()

    await waitForDatabaseReady()
    const lastCursor = await loadLastCursor()

    void withRetry(async () => await syncProfiles(lastCursor, abortController!.signal)).catch((error) => {
      logger.error('Sync workflow failed', { error: error.message })
    })

    logger.info('Profile synchronizer started (sync workflow running in background)')
  }

  async function stop(): Promise<void> {
    logger.info('Stopping profile synchronizer')
    running = false

    if (abortController) {
      abortController.abort()
    }

    await entityPersistent.waitForDrain()

    logger.info('Profile synchronizer stopped')
  }

  return {
    start,
    stop
  }
}
