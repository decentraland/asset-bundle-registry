import { IBaseComponent } from '@well-known-components/interfaces'
import { getDeployedEntitiesStreamFromPointerChanges } from '@dcl/snapshots-fetcher'
import { Entity, EntityType, PointerChangesSyncDeployment } from '@dcl/schemas'
import { AppComponents, ISynchronizerComponent, Sync } from '../../types'
import { SYNC_STATE_KEY } from '../../types/constants'
import { withTimeout } from '../../utils/async-utils'

const POINTER_CHANGES_POLL_INTERVAL_MS = 5000 // 5 seconds
const POINTER_CHANGES_WAIT_TIME_MS = 1000 // Wait time between API calls within stream
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_BOOTSTRAP_RETRIES = 3
const BOOTSTRAP_RETRY_DELAY_MS = 10000 // 10 seconds between retries
const SNAPSHOT_THRESHOLD_DAYS = 7 // Use snapshots if gap > 7 days

// Genesis timestamp: When profiles were first introduced to Decentraland
const GENESIS_TIMESTAMP = 1577836800000 // 2020-01-01T00:00:00Z

// Batch sizes for entity enrichment
const POINTER_CHANGES_BATCH_SIZE = 20 // Smaller batch for pointer-changes
const BATCH_FETCH_DELAY_MS = 200 // Delay between batch fetches to avoid overwhelming Catalyst
const ENTITY_FETCH_TIMEOUT_MS = 30000 // 30 second timeout for fetching entity data
const ENTITY_FETCH_MAX_RETRIES = 3 // Max retries for fetching entity data
const ENTITY_FETCH_RETRY_DELAY_MS = 2000 // 2 seconds between retries
const FAILED_FETCH_RETRY_BATCH_SIZE = 50 // Batch size for retrying failed fetches (reuse snapshot batch size)
const FAILED_FETCH_MAX_RETRIES = 10 // Max retries before giving up on a failed fetch
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
    | 'fetch'
    | 'metrics'
    | 'entityPersistent'
    | 'memoryStorage'
    | 'db'
    | 'catalyst'
    | 'snapshotsHandler'
  >
): Promise<ISynchronizerComponent & IBaseComponent> {
  const { logs, config, fetch, metrics, entityPersistent, memoryStorage, db, catalyst, snapshotsHandler } = components
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

  async function processProfileEntity(deployedEntity: PointerChangesSyncDeployment): Promise<void> {
    if (deployedEntity.entityType !== 'profile') {
      return
    }

    const profileEntity: Entity = {
      version: 'v3',
      id: deployedEntity.entityId,
      type: EntityType.PROFILE,
      pointers: deployedEntity.pointers,
      timestamp: deployedEntity.entityTimestamp,
      content: [],
      metadata: {}
    }

    await entityPersistent.persistEntity(profileEntity)
  }

  // Batch fetch complete entity data from Catalyst and convert to Profile.Entity
  async function enrichAndDeployProfiles(
    profileDeployments: Array<Sync.ProfileDeployment>
  ): Promise<{ deployed: number; failed: number }> {
    if (profileDeployments.length === 0) return { deployed: 0, failed: 0 }

    const entityIds = profileDeployments.map((p) => p.entityId)

    logger.info('Fetching complete entity data from Catalyst', {
      batchSize: entityIds.length,
      firstEntityId: entityIds[0]?.substring(0, 30) || 'none'
    })

    let deployedCount = 0
    let failedCount = 0
    let completeEntities: Entity[] = []
    let fetchSuccess = false
    let lastError: string | undefined

    // Retry logic with timeout
    for (let attempt = 1; attempt <= ENTITY_FETCH_MAX_RETRIES; attempt++) {
      try {
        logger.debug('Attempting to fetch entity batch', { attempt, maxRetries: ENTITY_FETCH_MAX_RETRIES })

        completeEntities = await withTimeout(catalyst.getEntitiesByIds(entityIds), ENTITY_FETCH_TIMEOUT_MS)

        fetchSuccess = true
        break
      } catch (error: any) {
        const isTimeout = error.message?.includes('timed out')
        lastError = error.message
        logger.warn('Entity fetch attempt failed', {
          attempt,
          maxRetries: ENTITY_FETCH_MAX_RETRIES,
          batchSize: entityIds.length,
          error: error.message,
          isTimeout: String(isTimeout)
        })

        if (attempt < ENTITY_FETCH_MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, ENTITY_FETCH_RETRY_DELAY_MS))
        }
      }
    }

    if (fetchSuccess && completeEntities.length > 0) {
      // Create a map for quick lookup
      const entityMap = new Map<string, Entity>()
      for (const entity of completeEntities) {
        entityMap.set(entity.id, entity)
      }

      // Track which deployments succeeded and which failed
      const failedDeployments: Sync.ProfileDeployment[] = []

      // Deploy each profile with enriched data
      for (const deployment of profileDeployments) {
        const completeEntity = entityMap.get(deployment.entityId)

        if (completeEntity) {
          // Successfully fetched - persist it
          const profileEntity: Entity = {
            version: 'v3',
            id: deployment.entityId,
            type: EntityType.PROFILE,
            pointers: [deployment.pointer],
            timestamp: deployment.timestamp,
            content: completeEntity.content || [],
            metadata: completeEntity.metadata || {}
          }

          await entityPersistent.persistEntity(profileEntity)
          deployedCount++
        } else {
          // Entity not found in response - track as failed
          failedDeployments.push(deployment)
        }
      }

      // Track partial failures
      if (failedDeployments.length > 0) {
        const now = Date.now()
        for (const deployment of failedDeployments) {
          try {
            await db.insertFailedProfileFetch({
              entityId: deployment.entityId,
              pointer: deployment.pointer,
              timestamp: deployment.timestamp,
              authChain: deployment.authChain,
              firstFailedAt: now,
              retryCount: 0,
              errorMessage: 'Entity not found in Catalyst response'
            })
            failedCount++
          } catch (error: any) {
            logger.warn('Failed to track failed profile fetch', {
              entityId: deployment.entityId,
              error: error.message
            })
          }
        }
      }

      logger.info('Batch enrichment complete', {
        requested: entityIds.length,
        fetched: completeEntities.length,
        deployed: deployedCount,
        failed: failedCount
      })
    } else {
      // All fetch attempts failed - track all deployments as failed
      logger.error('All fetch attempts failed, tracking failures for retry', {
        batchSize: entityIds.length,
        attempts: ENTITY_FETCH_MAX_RETRIES,
        error: lastError || 'Unknown error'
      })

      const now = Date.now()
      for (const deployment of profileDeployments) {
        try {
          await db.insertFailedProfileFetch({
            entityId: deployment.entityId,
            pointer: deployment.pointer,
            timestamp: deployment.timestamp,
            authChain: deployment.authChain,
            firstFailedAt: now,
            retryCount: 0,
            errorMessage: lastError || 'All fetch attempts failed'
          })
          failedCount++
        } catch (error: any) {
          logger.warn('Failed to track failed profile fetch', {
            entityId: deployment.entityId,
            error: error.message
          })
        }
      }
    }

    return { deployed: deployedCount, failed: failedCount }
  }

  async function retryFailedProfileFetches(): Promise<{ retried: number; succeeded: number; failed: number }> {
    let retried = 0
    let succeeded = 0
    let failed = 0

    try {
      // Fetch failed fetches that haven't exceeded max retries
      const failedFetches = await db.getFailedProfileFetches(FAILED_FETCH_RETRY_BATCH_SIZE, FAILED_FETCH_MAX_RETRIES)

      if (failedFetches.length === 0) {
        return { retried: 0, succeeded: 0, failed: 0 }
      }

      logger.info('Retrying failed profile fetches', {
        count: failedFetches.length,
        maxRetries: FAILED_FETCH_MAX_RETRIES
      })

      // Check for newer profiles before retrying (timestamp safety)
      const deploymentsToRetry: Sync.ProfileDeployment[] = []
      const skipped: string[] = []

      for (const failedFetch of failedFetches) {
        // Check if a newer profile already exists
        const existingProfile = await db.getProfileByPointer(failedFetch.pointer)
        if (existingProfile && existingProfile.timestamp >= failedFetch.timestamp) {
          // Newer or same timestamp profile already exists - skip retry and clean up
          logger.debug('Skipping retry - newer profile already exists', {
            entityId: failedFetch.entityId.substring(0, 30),
            pointer: failedFetch.pointer,
            existingTimestamp: existingProfile.timestamp,
            failedTimestamp: failedFetch.timestamp
          })
          await db.deleteFailedProfileFetch(failedFetch.entityId)
          skipped.push(failedFetch.entityId)
          continue
        }

        deploymentsToRetry.push({
          entityId: failedFetch.entityId,
          pointer: failedFetch.pointer,
          timestamp: failedFetch.timestamp,
          authChain: failedFetch.authChain
        })
      }

      if (deploymentsToRetry.length === 0) {
        logger.info('All failed fetches skipped - newer profiles already exist', { skipped: skipped.length })
        return { retried: skipped.length, succeeded: skipped.length, failed: 0 }
      }

      retried = deploymentsToRetry.length

      // Attempt to fetch entities
      const entityIds = deploymentsToRetry.map((d) => d.entityId)
      let completeEntities: Entity[] = []
      let fetchSuccess = false
      let lastError: string | undefined

      // Use same retry logic as enrichAndDeployProfiles
      for (let attempt = 1; attempt <= ENTITY_FETCH_MAX_RETRIES; attempt++) {
        try {
          completeEntities = await withTimeout(catalyst.getEntitiesByIds(entityIds), ENTITY_FETCH_TIMEOUT_MS)
          fetchSuccess = true
          break
        } catch (error: any) {
          lastError = error.message
          logger.warn('Retry fetch attempt failed', {
            attempt,
            maxRetries: ENTITY_FETCH_MAX_RETRIES,
            batchSize: entityIds.length,
            error: error.message
          })

          if (attempt < ENTITY_FETCH_MAX_RETRIES) {
            await new Promise((resolve) => setTimeout(resolve, ENTITY_FETCH_RETRY_DELAY_MS))
          }
        }
      }

      if (fetchSuccess && completeEntities.length > 0) {
        // Create map for quick lookup
        const entityMap = new Map<string, Entity>()
        for (const entity of completeEntities) {
          entityMap.set(entity.id, entity)
        }

        // Process each deployment
        for (const deployment of deploymentsToRetry) {
          const completeEntity = entityMap.get(deployment.entityId)

          if (completeEntity) {
            // Successfully fetched - persist it
            const profileEntity: Entity = {
              version: 'v3',
              id: deployment.entityId,
              type: EntityType.PROFILE,
              pointers: [deployment.pointer],
              timestamp: deployment.timestamp,
              content: completeEntity.content || [],
              metadata: completeEntity.metadata || {}
            }

            await entityPersistent.persistEntity(profileEntity)
            await db.deleteFailedProfileFetch(deployment.entityId)
            succeeded++
          } else {
            // Entity not found - update retry count
            const failedFetch = failedFetches.find((f) => f.entityId === deployment.entityId)
            if (failedFetch) {
              const newRetryCount = failedFetch.retryCount + 1
              await db.updateFailedProfileFetchRetry(
                deployment.entityId,
                newRetryCount,
                'Entity not found in Catalyst response'
              )
              failed++
            }
          }
        }
      } else {
        // All fetch attempts failed - update retry counts
        for (const deployment of deploymentsToRetry) {
          const failedFetch = failedFetches.find((f) => f.entityId === deployment.entityId)
          if (failedFetch) {
            const newRetryCount = failedFetch.retryCount + 1
            await db.updateFailedProfileFetchRetry(deployment.entityId, newRetryCount, lastError)
            failed++
          }
        }
      }

      logger.info('Failed fetch retry cycle complete', {
        retried,
        succeeded,
        failed,
        skipped: skipped.length
      })
    } catch (error: any) {
      logger.error('Error during failed fetch retry', {
        error: error.message,
        stack: error.stack?.substring(0, 200)
      })
    }

    return { retried, succeeded, failed }
  }

  async function bootstrapFromPointerChanges(fromTimestamp: number): Promise<boolean> {
    const bootstrapStartTime = Date.now()
    const gapMs = bootstrapStartTime - fromTimestamp
    const gapDays = gapMs / ONE_DAY_MS

    logger.info('=== STARTING POINTER-CHANGES BOOTSTRAP ===', {
      catalyst: PRIMARY_CATALYST,
      fromTimestamp: new Date(fromTimestamp).toISOString(),
      gapToNow: `${gapDays.toFixed(2)} days`
    })

    let profilesProcessed = 0
    let entitiesProcessed = 0
    let lastEntityId = ''
    let duplicateCount = 0
    const MAX_DUPLICATES = 3

    // Collect profiles in batches for enrichment
    const profileBatch: Array<Sync.ProfileDeployment> = []

    try {
      const stream = getDeployedEntitiesStreamFromPointerChanges(
        {
          fetcher: fetch,
          metrics: metrics as any,
          logs: logs
        },
        {
          fromTimestamp: fromTimestamp,
          pointerChangesWaitTime: POINTER_CHANGES_WAIT_TIME_MS
        },
        PRIMARY_CATALYST + '/content'
      )

      for await (const deployedEntity of stream) {
        if (!running) break

        entitiesProcessed++

        // Detect when stream starts returning same entity repeatedly
        if (deployedEntity.entityId === lastEntityId) {
          duplicateCount++
          if (duplicateCount >= MAX_DUPLICATES) {
            logger.info('Pointer-changes caught up to current time (stream returning same entity)', {
              lastEntityId: lastEntityId.substring(0, 30),
              duplicateCount
            })
            break
          }
        } else {
          lastEntityId = deployedEntity.entityId
          duplicateCount = 0
        }

        syncState.lastPointerChangesCheck = Math.max(syncState.lastPointerChangesCheck, deployedEntity.entityTimestamp)

        if (deployedEntity.entityType === 'profile') {
          profileBatch.push({
            entityId: deployedEntity.entityId,
            pointer: deployedEntity.pointers[0],
            timestamp: deployedEntity.entityTimestamp,
            authChain: deployedEntity.authChain
          })

          // Process batch when it reaches the threshold
          if (profileBatch.length >= POINTER_CHANGES_BATCH_SIZE) {
            const result = await enrichAndDeployProfiles(profileBatch)
            profilesProcessed += result.deployed
            profileBatch.length = 0 // Clear the batch

            // Add delay to avoid overwhelming Catalyst
            await new Promise((resolve) => setTimeout(resolve, BATCH_FETCH_DELAY_MS))
          }
        }

        // Log progress every 1000 profiles or 10000 entities
        if (profilesProcessed > 0 && profilesProcessed % 1000 === 0) {
          logger.info('Pointer-changes progress', {
            entitiesProcessed,
            profilesFound: profilesProcessed,
            currentTimestamp: new Date(deployedEntity.entityTimestamp).toISOString()
          })
          await persistState()
        }
      }

      // Process any remaining profiles in the batch
      if (profileBatch.length > 0) {
        const result = await enrichAndDeployProfiles(profileBatch)
        profilesProcessed += result.deployed
      }

      await entityPersistent.waitForDrain()

      const bootstrapDuration = Date.now() - bootstrapStartTime
      logger.info('=== POINTER-CHANGES BOOTSTRAP COMPLETE ===', {
        entitiesProcessed,
        profilesFound: profilesProcessed,
        durationMs: bootstrapDuration,
        durationMinutes: (bootstrapDuration / 60000).toFixed(2),
        lastTimestamp: new Date(syncState.lastPointerChangesCheck).toISOString()
      })

      return true
    } catch (error: any) {
      logger.error('Pointer-changes bootstrap failed', {
        error: error.message,
        entitiesProcessedSoFar: entitiesProcessed,
        profilesFoundSoFar: profilesProcessed
      })
      return false
    }
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
      const success = await bootstrapFromPointerChanges(lastTimestamp)

      if (success) {
        entityPersistent.setBootstrapComplete()
        syncState.bootstrapComplete = true
        await persistState()
        return
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

  async function syncFromCatalyst(serverUrl: string, fromTimestamp: number): Promise<number> {
    let lastTimestamp = fromTimestamp

    try {
      logger.debug('Starting sync from catalyst', { serverUrl, fromTimestamp })

      const stream = getDeployedEntitiesStreamFromPointerChanges(
        {
          fetcher: fetch,
          metrics: metrics as any,
          logs: logs
        },
        {
          fromTimestamp: fromTimestamp,
          pointerChangesWaitTime: POINTER_CHANGES_WAIT_TIME_MS
        },
        serverUrl
      )

      for await (const deployedEntity of stream) {
        if (!running) break

        await processProfileEntity(deployedEntity)
        lastTimestamp = Math.max(lastTimestamp, deployedEntity.entityTimestamp)
      }
    } catch (error: any) {
      logger.error('Error syncing from catalyst', {
        serverUrl,
        error: error.message
      })
    }

    return lastTimestamp
  }

  async function runPointerChangesLoop(): Promise<void> {
    while (running) {
      const fromTimestamp = syncState.lastPointerChangesCheck || Date.now()

      logger.debug('Polling primary catalyst for changes', {
        server: PRIMARY_CATALYST,
        fromTimestamp: new Date(fromTimestamp).toISOString()
      })

      const newTimestamp = await syncFromCatalyst(PRIMARY_CATALYST + '/content', fromTimestamp)

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
        await retryFailedProfileFetches()
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
