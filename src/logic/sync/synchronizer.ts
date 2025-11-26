import { IBaseComponent } from '@well-known-components/interfaces'
import { AppComponents, ISynchronizerComponent, Sync } from '../../types'
import { SYNC_STATE_KEY } from '../../types/constants'

const POINTER_CHANGES_POLL_INTERVAL_MS = 5000 // 5 seconds
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_BOOTSTRAP_RETRIES = 3
const BOOTSTRAP_RETRY_DELAY_MS = 10000 // 10 seconds between retries
const SNAPSHOT_THRESHOLD_DAYS = 7 // Use snapshots if gap > 7 days

// Genesis timestamp: When profiles were first introduced to Decentraland
const GENESIS_TIMESTAMP = 1577836800000 // 2020-01-01T00:00:00Z

const FAILED_FETCH_RETRY_INTERVAL_MS = 60000 // 1 minute between retry cycles

type PersistedSyncState = {
  lastPointerChangesCheck: number
  bootstrapComplete: boolean
}

export async function createSynchronizerComponent(
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
): Promise<ISynchronizerComponent & IBaseComponent> {
  const {
    logs,
    config,
    entityPersistent,
    memoryStorage,
    db,
    snapshotsHandler,
    pointerChangesHandler,
    failedProfilesRetrier
  } = components
  const logger = logs.getLogger('synchronizer')
  const PRIMARY_CATALYST = await config.requireString('CATALYST_LOADBALANCER_HOST')

  let running = false
  const syncState: Sync.State = {
    bootstrapComplete: false,
    lastPointerChangesCheck: 0
  }

  async function loadPersistedState(): Promise<void> {
    try {
      const stored = await memoryStorage.get<string>(SYNC_STATE_KEY)
      if (stored && stored.length > 0) {
        const state: PersistedSyncState = JSON.parse(stored[0])
        syncState.lastPointerChangesCheck = state.lastPointerChangesCheck
        syncState.bootstrapComplete = state.bootstrapComplete
        logger.info('Loaded persisted sync state', {
          lastPointerChangesCheck: new Date(state.lastPointerChangesCheck).toISOString(),
          bootstrapComplete: String(state.bootstrapComplete)
        })
      }
    } catch (error: any) {
      logger.warn('Failed to load persisted sync state, starting fresh', { error: error.message })
    }
  }

  async function persistState(): Promise<void> {
    try {
      const stateJson = JSON.stringify({
        lastPointerChangesCheck: syncState.lastPointerChangesCheck,
        bootstrapComplete: syncState.bootstrapComplete
      })
      await memoryStorage.purge(SYNC_STATE_KEY)
      await memoryStorage.set<string>(SYNC_STATE_KEY, stateJson)
    } catch (error: any) {
      logger.warn('Failed to persist sync state', { error: error.message })
    }
  }

  async function determineGenesisTimestamp(): Promise<number> {
    // Priority 1: Check persisted state (from Redis/memory)
    if (syncState.lastPointerChangesCheck > 0) {
      logger.info('Using persisted sync state timestamp', {
        timestamp: new Date(syncState.lastPointerChangesCheck).toISOString()
      })
      return syncState.lastPointerChangesCheck
    }

    // Priority 2: Check database for latest profile
    try {
      const latestDbTimestamp = await db.getLatestProfileTimestamp()
      if (latestDbTimestamp) {
        logger.info('Using latest profile timestamp from database', {
          timestamp: new Date(latestDbTimestamp).toISOString()
        })
        return latestDbTimestamp
      }
    } catch (error: any) {
      logger.warn('Failed to fetch latest profile timestamp from database', { error: error.message })
    }

    // Priority 3: Use genesis timestamp (start from beginning)
    logger.info('No existing data found, starting from genesis', {
      genesisTimestamp: new Date(GENESIS_TIMESTAMP).toISOString()
    })
    return GENESIS_TIMESTAMP
  }

  async function bootstrapWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_BOOTSTRAP_RETRIES; attempt++) {
      if (!running) return

      logger.info('Bootstrap attempt', { attempt, maxRetries: MAX_BOOTSTRAP_RETRIES })

      const fromTimestamp = await determineGenesisTimestamp()
      const now = Date.now()
      const gapDays = (now - fromTimestamp) / ONE_DAY_MS

      logger.info('Bootstrap gap analysis', {
        fromTimestamp: new Date(fromTimestamp).toISOString(),
        gapDays: gapDays.toFixed(2),
        useSnapshots: String(gapDays > SNAPSHOT_THRESHOLD_DAYS)
      })

      let lastTimestamp = fromTimestamp

      // Phase 1: Use snapshots for large gaps
      if (gapDays > SNAPSHOT_THRESHOLD_DAYS) {
        logger.info('Using snapshot-based bootstrap for large time gap')
        lastTimestamp = await snapshotsHandler.syncProfiles(fromTimestamp)
      }

      // Phase 2: Use pointer-changes for recent data
      const newTimestamp = await pointerChangesHandler.syncProfiles(lastTimestamp)
      if (newTimestamp > lastTimestamp) {
        lastTimestamp = newTimestamp
      }

      if (attempt < MAX_BOOTSTRAP_RETRIES && running) {
        logger.info('Retrying bootstrap after delay', { delayMs: BOOTSTRAP_RETRY_DELAY_MS })
        await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS))
      }
    }

    // All retries failed
    logger.error('All bootstrap retries failed, starting incremental sync from now')
    syncState.lastPointerChangesCheck = Date.now()
    entityPersistent.setBootstrapComplete()
    syncState.bootstrapComplete = true
    await persistState()
  }

  async function runPointerChangesLoop(): Promise<void> {
    while (running) {
      const fromTimestamp = syncState.lastPointerChangesCheck || Date.now()

      logger.debug('Polling primary catalyst for changes', {
        server: PRIMARY_CATALYST,
        fromTimestamp: new Date(fromTimestamp).toISOString()
      })

      const newTimestamp = await pointerChangesHandler.syncProfiles(fromTimestamp)

      if (newTimestamp > syncState.lastPointerChangesCheck) {
        syncState.lastPointerChangesCheck = newTimestamp
        await persistState()
      }

      await new Promise((resolve) => setTimeout(resolve, POINTER_CHANGES_POLL_INTERVAL_MS))
    }
  }

  async function runFailedFetchRetryLoop(): Promise<void> {
    while (running) {
      try {
        await failedProfilesRetrier.retryFailedProfiles()
      } catch (error: any) {
        logger.error('Error in failed fetch retry loop', { error: error.message })
      }

      // Wait before next retry cycle
      await new Promise((resolve) => setTimeout(resolve, FAILED_FETCH_RETRY_INTERVAL_MS))
    }
  }

  async function runSyncWorkflow(): Promise<void> {
    if (!syncState.bootstrapComplete) {
      await bootstrapWithRetry()
    } else {
      logger.info('Bootstrap already complete, skipping to incremental sync', {
        lastPointerChangesCheck: new Date(syncState.lastPointerChangesCheck).toISOString()
      })
    }

    logger.info('Starting incremental sync loop and failed fetch retry loop')

    // Run both loops in parallel
    await Promise.all([runPointerChangesLoop(), runFailedFetchRetryLoop()])
  }

  async function waitForDatabaseReady(): Promise<void> {
    const maxRetries = 30
    const retryDelayMs = 1000

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Try to query the profiles table - this will fail if migrations haven't run
        await db.getLatestProfileTimestamp()
        logger.info('Database is ready, profiles table exists')
        return
      } catch (error: any) {
        logger.info(`Waiting for database migrations to complete`, { attempt, maxRetries })
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      }
    }
  }

  async function start(): Promise<void> {
    logger.info('Starting profile synchronizer')
    running = true

    await loadPersistedState()
    await waitForDatabaseReady()

    runSyncWorkflow().catch((error) => {
      logger.error('Sync workflow failed', { error: error.message })
    })

    logger.info('Profile synchronizer started (sync workflow running in background)')
  }

  async function stop(): Promise<void> {
    logger.info('Stopping profile synchronizer')
    running = false

    await entityPersistent.waitForDrain()
    await persistState()

    logger.info('Profile synchronizer stopped')
  }

  function getSyncState(): Sync.State {
    return { ...syncState }
  }

  async function resetSyncState(): Promise<void> {
    logger.info('Resetting sync state')

    // Reset in-memory state
    syncState.lastPointerChangesCheck = 0
    syncState.bootstrapComplete = false

    // Purge from Redis
    try {
      await memoryStorage.purge(SYNC_STATE_KEY)
      logger.info('Sync state reset complete')
    } catch (error: any) {
      logger.error('Failed to purge sync state from Redis', { error: error.message })
      throw error
    }
  }

  return {
    start,
    stop,
    getSyncState,
    resetSyncState
  }
}
