import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents, ISynchronizerComponent } from '../../types'
import { withRetry } from '../../utils/timer'

export const GENESIS_TIMESTAMP = 1577836800000 // 2020-01-01T00:00:00Z
const FIVE_SECONDS_MS = 5000 // 5 seconds
const TEN_MINUTES_MS = 10 * 60 * 1000 // 10 minutes
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export async function createSynchronizerComponent(
  components: Pick<
    AppComponents,
    | 'logs'
    | 'config'
    | 'entityPersister'
    | 'db'
    | 'snapshotsHandler'
    | 'pointerChangesHandler'
    | 'failedProfilesRetrier'
  >
): Promise<ISynchronizerComponent> {
  const { logs, config, entityPersister, db, snapshotsHandler, pointerChangesHandler, failedProfilesRetrier } =
    components
  const logger = logs.getLogger('synchronizer')

  const POINTER_CHANGES_POLL_INTERVAL_MS =
    (await config.getNumber('POINTER_CHANGES_POLL_INTERVAL_MS')) || FIVE_SECONDS_MS
  const FAILED_PROFILES_RETRY_INTERVAL_MS =
    (await config.getNumber('FAILED_PROFILES_RETRY_INTERVAL_MS')) || TEN_MINUTES_MS

  let running = false
  let syncWorkflowRunning = false
  let abortController: AbortController | null = null
  let loopPromises: Promise<void>[] = []

  async function loadLastCursor(): Promise<number> {
    let lastCursor: number = GENESIS_TIMESTAMP
    try {
      lastCursor = (await db.getLatestProfileTimestamp()) ?? lastCursor
      logger.info('Loaded last cursor from database', { lastCursor })
    } catch (error: any) {
      logger.warn('Failed to load last cursor', { error: error.message })
    } finally {
      return lastCursor
    }
  }

  async function waitForComponentsReady(startedFn: () => boolean): Promise<void> {
    while (!startedFn()) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    logger.info('All components started, synchronizer can begin')
  }

  async function loop(
    callToLoop: (abortSignal: AbortSignal) => Promise<void>,
    { abortSignal, interval }: { abortSignal: AbortSignal; interval: number }
  ): Promise<void> {
    while (running && !abortSignal.aborted) {
      await callToLoop(abortSignal).catch((error) => {
        logger.error('Error in loop', { error: error.message })
      })
      if (!abortSignal.aborted && running) {
        await new Promise<void>((resolve) => {
          // eslint-disable-next-line prefer-const
          let timeoutId: NodeJS.Timeout
          const abortHandler = () => {
            clearTimeout(timeoutId)
            abortSignal.removeEventListener('abort', abortHandler)
            resolve()
          }
          abortSignal.addEventListener('abort', abortHandler)
          timeoutId = setTimeout(() => {
            abortSignal.removeEventListener('abort', abortHandler)
            resolve()
          }, interval)
        })
      }
    }
    if (abortSignal.aborted) {
      logger.info('Loop aborted')
    }
  }

  async function syncProfiles(fromTimestamp: number, abortSignal: AbortSignal): Promise<void> {
    if (syncWorkflowRunning) {
      logger.warn('Sync workflow already running, skipping concurrent call')
      return
    }
    syncWorkflowRunning = true
    try {
      const isAWeekOld = Date.now() - fromTimestamp > ONE_DAY_MS * 7
      let cursor: number = fromTimestamp

      // Process snapshots first if needed, and wait for completion before starting pointer-changes loop
      if (isAWeekOld && !abortSignal.aborted) {
        logger.info('Processing snapshots before starting pointer-changes loop')
        cursor =
          (await withRetry(async () => await snapshotsHandler.syncProfiles(fromTimestamp, abortSignal))) ?? cursor
        logger.info('Snapshots processing completed, starting pointer-changes loop', { cursor })
      }

      const pointerChangesLoopPromise = loop(
        async (signal) => {
          const newCursor = await pointerChangesHandler.syncProfiles(cursor, signal)
          if (newCursor && newCursor > cursor) {
            cursor = newCursor
          }
        },
        { abortSignal, interval: POINTER_CHANGES_POLL_INTERVAL_MS }
      )

      const retrierLoopPromise = loop(
        async (signal) => {
          await failedProfilesRetrier.retryFailedProfiles(signal)
        },
        { abortSignal, interval: FAILED_PROFILES_RETRY_INTERVAL_MS }
      )

      // Track promises for monitoring - handled by Promise.all below
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      loopPromises = [pointerChangesLoopPromise, retrierLoopPromise]

      void Promise.all(loopPromises)
    } finally {
      syncWorkflowRunning = false
    }
  }

  async function start(startOptions: IBaseComponent.ComponentStartOptions): Promise<void> {
    const isSinchronizerDisabled = (await config.getString('DISABLE_PROFILE_SYNC')) === 'true'
    if (isSinchronizerDisabled) {
      logger.info('Profile sync is disabled, skipping')
      return
    }

    running = true
    abortController = new AbortController()

    await waitForComponentsReady(startOptions.started)
    const lastCursor = await loadLastCursor()

    logger.info('Starting profile synchronizer', { lastCursor })

    void withRetry(async () => await syncProfiles(lastCursor, abortController!.signal)).catch((error) => {
      logger.error('Sync workflow failed', { error: error.message })
    })
  }

  async function stop(): Promise<void> {
    logger.info('Stopping profile synchronizer')
    running = false
    syncWorkflowRunning = false

    if (abortController) {
      abortController.abort()
    }

    // Wait for loops to finish (they should exit quickly after abort)
    if (loopPromises.length > 0) {
      await Promise.allSettled(loopPromises)
    }

    await entityPersister.waitForDrain()

    logger.info('Profile synchronizer stopped')
  }

  return {
    start,
    stop
  }
}
