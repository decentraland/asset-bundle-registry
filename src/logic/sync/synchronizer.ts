import { IBaseComponent } from '@well-known-components/interfaces'
import {
  getDeployedEntitiesStreamFromPointerChanges,
  getDeployedEntitiesStreamFromSnapshot
} from '@dcl/snapshots-fetcher'
import { Entity, EntityType, PointerChangesSyncDeployment } from '@dcl/schemas'
import { AppComponents, ISynchronizerComponent, Sync } from '../../types'
import { SYNC_STATE_KEY, SNAPSHOT_DOWNLOAD_FOLDER } from '../../types/constants'

const POINTER_CHANGES_POLL_INTERVAL_MS = 5000 // 5 seconds
const POINTER_CHANGES_WAIT_TIME_MS = 1000 // Wait time between API calls within stream
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const MAX_BOOTSTRAP_RETRIES = 3
const BOOTSTRAP_RETRY_DELAY_MS = 10000 // 10 seconds between retries
const SNAPSHOT_THRESHOLD_DAYS = 7 // Use snapshots if gap > 7 days

// Genesis timestamp: When profiles were first introduced to Decentraland
const GENESIS_TIMESTAMP = 1577836800000 // 2020-01-01T00:00:00Z

// Batch sizes for entity enrichment
const SNAPSHOT_BATCH_SIZE = 50 // Batch size for fetching complete entity data during snapshots
const POINTER_CHANGES_BATCH_SIZE = 20 // Smaller batch for pointer-changes
const BATCH_FETCH_DELAY_MS = 200 // Delay between batch fetches to avoid overwhelming Catalyst
const ENTITY_FETCH_TIMEOUT_MS = 30000 // 30 second timeout for fetching entity data
const ENTITY_FETCH_MAX_RETRIES = 3 // Max retries for fetching entity data
const ENTITY_FETCH_RETRY_DELAY_MS = 2000 // 2 seconds between retries

type PersistedSyncState = {
  lastPointerChangesCheck: number
  bootstrapComplete: boolean
}

type SnapshotMetadata = {
  hash: string
  timeRange: {
    initTimestamp: number
    endTimestamp: number
  }
  numberOfEntities: number
  replacedSnapshotHashes?: string[]
  generationTimestamp: number
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
    | 'snapshotContentStorage'
    | 'catalyst'
  >
): Promise<ISynchronizerComponent & IBaseComponent> {
  const { logs, config, fetch, metrics, entityPersistent, memoryStorage, db, snapshotContentStorage, catalyst } =
    components
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

  async function fetchSnapshotMetadata(): Promise<SnapshotMetadata[]> {
    try {
      const response = await fetch.fetch(`${PRIMARY_CATALYST}/content/snapshots`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const snapshots: SnapshotMetadata[] = await response.json()
      logger.info('Fetched snapshot metadata', { count: snapshots.length })
      return snapshots
    } catch (error: any) {
      logger.error('Failed to fetch snapshot metadata', { error: error.message })
      return []
    }
  }

  function selectSnapshotsToProcess(
    snapshots: SnapshotMetadata[],
    fromTimestamp: number,
    currentTime: number
  ): SnapshotMetadata[] {
    // Sort oldest first
    const sorted = snapshots.sort((a, b) => a.timeRange.initTimestamp - b.timeRange.initTimestamp)

    // Filter: only snapshots with data newer than fromTimestamp
    const relevant = sorted.filter(
      (s) => s.timeRange.endTimestamp > fromTimestamp && s.timeRange.initTimestamp < currentTime
    )

    logger.info('Selected snapshots to process', {
      total: snapshots.length,
      relevant: relevant.length,
      fromTimestamp: new Date(fromTimestamp).toISOString()
    })

    return relevant
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

  // Helper function to fetch with timeout
  async function fetchWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutHandle: NodeJS.Timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    })

    try {
      const result = await Promise.race([promise, timeoutPromise])
      clearTimeout(timeoutHandle!)
      return result
    } catch (error) {
      clearTimeout(timeoutHandle!)
      throw error
    }
  }

  // Batch fetch complete entity data from Catalyst and convert to Profile.Entity
  async function enrichAndDeployProfiles(
    profileDeployments: Array<{ entityId: string; pointer: string; timestamp: number; authChain: any }>
  ): Promise<number> {
    if (profileDeployments.length === 0) return 0

    const entityIds = profileDeployments.map((p) => p.entityId)

    logger.info('Fetching complete entity data from Catalyst', {
      batchSize: entityIds.length,
      firstEntityId: entityIds[0]?.substring(0, 30) || 'none'
    })

    let deployedCount = 0
    let completeEntities: Entity[] = []
    let fetchSuccess = false

    // Retry logic with timeout
    for (let attempt = 1; attempt <= ENTITY_FETCH_MAX_RETRIES; attempt++) {
      try {
        logger.debug('Attempting to fetch entity batch', { attempt, maxRetries: ENTITY_FETCH_MAX_RETRIES })

        completeEntities = await fetchWithTimeout(catalyst.getEntitiesByIds(entityIds), ENTITY_FETCH_TIMEOUT_MS)

        fetchSuccess = true
        break
      } catch (error: any) {
        const isTimeout = error.message?.includes('timed out')
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

      // Deploy each profile with enriched data
      for (const deployment of profileDeployments) {
        const completeEntity = entityMap.get(deployment.entityId)

        const profileEntity: Entity = {
          version: 'v3',
          id: deployment.entityId,
          type: EntityType.PROFILE,
          pointers: [deployment.pointer],
          timestamp: deployment.timestamp,
          content: completeEntity?.content || [],
          metadata: completeEntity?.metadata || {}
        }

        await entityPersistent.persistEntity(profileEntity)
        deployedCount++
      }

      logger.info('Batch enrichment complete', {
        requested: entityIds.length,
        fetched: completeEntities.length,
        deployed: deployedCount
      })
    } else {
      logger.error('All fetch attempts failed, deploying with partial data', {
        batchSize: entityIds.length,
        attempts: ENTITY_FETCH_MAX_RETRIES
      })

      // Fallback: deploy with empty metadata/content
      for (const deployment of profileDeployments) {
        const profileEntity: Entity = {
          version: 'v3',
          id: deployment.entityId,
          type: EntityType.PROFILE,
          pointers: [deployment.pointer],
          timestamp: deployment.timestamp,
          content: [],
          metadata: {}
        }

        await entityPersistent.persistEntity(profileEntity)
        deployedCount++
      }
    }

    return deployedCount
  }

  async function bootstrapFromSnapshots(fromTimestamp: number): Promise<number> {
    logger.info('=== STARTING SNAPSHOT-BASED BOOTSTRAP ===')

    const snapshots = await fetchSnapshotMetadata()
    if (snapshots.length === 0) {
      logger.warn('No snapshots available from Catalyst, falling back to pointer-changes')
      return fromTimestamp
    }

    logger.info('Snapshot metadata fetched', {
      totalSnapshots: snapshots.length,
      oldestSnapshot: new Date(Math.min(...snapshots.map((s) => s.timeRange.initTimestamp))).toISOString(),
      newestSnapshot: new Date(Math.max(...snapshots.map((s) => s.timeRange.endTimestamp))).toISOString()
    })

    const currentTime = Date.now()
    const snapshotsToProcess = selectSnapshotsToProcess(snapshots, fromTimestamp, currentTime)

    if (snapshotsToProcess.length === 0) {
      logger.info('No relevant snapshots to process (all may be older than fromTimestamp)')
      return fromTimestamp
    }

    logger.info('Snapshots selected for processing', {
      count: snapshotsToProcess.length,
      firstSnapshotHash: snapshotsToProcess[0]?.hash.substring(0, 30) || 'none',
      lastSnapshotHash: snapshotsToProcess[snapshotsToProcess.length - 1]?.hash.substring(0, 30) || 'none'
    })

    let lastProcessedTimestamp = fromTimestamp
    let totalProfilesProcessed = 0
    let totalEntitiesProcessed = 0
    let snapshotsProcessedCount = 0

    for (const snapshotMeta of snapshotsToProcess) {
      if (!running) break

      // Check if already processed
      const alreadyProcessed = await db.isSnapshotProcessed(snapshotMeta.hash)
      if (alreadyProcessed) {
        logger.info('Skipping already processed snapshot', {
          hash: snapshotMeta.hash.substring(0, 30),
          timeRangeEnd: new Date(snapshotMeta.timeRange.endTimestamp).toISOString()
        })
        // Update timestamp to skip ahead
        lastProcessedTimestamp = Math.max(lastProcessedTimestamp, snapshotMeta.timeRange.endTimestamp)
        snapshotsProcessedCount++
        continue
      }

      logger.info(`=== PROCESSING SNAPSHOT ${snapshotsProcessedCount + 1}/${snapshotsToProcess.length} ===`, {
        hash: snapshotMeta.hash.substring(0, 30),
        timeRangeInit: new Date(snapshotMeta.timeRange.initTimestamp).toISOString(),
        timeRangeEnd: new Date(snapshotMeta.timeRange.endTimestamp).toISOString(),
        totalEntitiesInSnapshot: snapshotMeta.numberOfEntities
      })

      let snapshotProfilesProcessed = 0
      let snapshotEntitiesProcessed = 0

      try {
        // Use the snapshot's init timestamp to process ALL entities in this snapshot
        // We want to process the entire snapshot file, not just entities newer than our last processed
        const snapshotFromTimestamp = Math.max(fromTimestamp, snapshotMeta.timeRange.initTimestamp)
        logger.info('Processing snapshot with timestamp filter', {
          snapshotHash: snapshotMeta.hash.substring(0, 20),
          fromTimestamp: new Date(snapshotFromTimestamp).toISOString(),
          snapshotInitTimestamp: new Date(snapshotMeta.timeRange.initTimestamp).toISOString()
        })

        const stream = getDeployedEntitiesStreamFromSnapshot(
          {
            logs: logs,
            metrics: metrics as any,
            storage: snapshotContentStorage
          },
          {
            fromTimestamp: snapshotFromTimestamp,
            requestRetryWaitTime: 1000,
            requestMaxRetries: 5,
            tmpDownloadFolder: SNAPSHOT_DOWNLOAD_FOLDER,
            deleteSnapshotAfterUsage: true
          },
          snapshotMeta.hash,
          new Set([PRIMARY_CATALYST + '/content'])
        )

        // Collect profiles in batches for enrichment
        const profileBatch: Array<{ entityId: string; pointer: string; timestamp: number; authChain: any }> = []

        for await (const entity of stream) {
          if (!running) break

          snapshotEntitiesProcessed++
          totalEntitiesProcessed++

          if (entity.entityType === 'profile') {
            profileBatch.push({
              entityId: entity.entityId,
              pointer: entity.pointers[0],
              timestamp: entity.entityTimestamp,
              authChain: entity.authChain
            })

            lastProcessedTimestamp = Math.max(lastProcessedTimestamp, entity.entityTimestamp)

            // Process batch when it reaches the threshold
            if (profileBatch.length >= SNAPSHOT_BATCH_SIZE) {
              const deployed = await enrichAndDeployProfiles(profileBatch)
              snapshotProfilesProcessed += deployed
              totalProfilesProcessed += deployed
              profileBatch.length = 0 // Clear the batch

              // Add delay to avoid overwhelming Catalyst
              await new Promise((resolve) => setTimeout(resolve, BATCH_FETCH_DELAY_MS))
            }
          }

          // Log progress every 5000 entities
          if (snapshotEntitiesProcessed % 5000 === 0) {
            logger.info('Snapshot processing progress', {
              snapshotHash: snapshotMeta.hash.substring(0, 20),
              entitiesProcessed: snapshotEntitiesProcessed,
              profilesFound: snapshotProfilesProcessed,
              percentComplete: ((snapshotEntitiesProcessed / snapshotMeta.numberOfEntities) * 100).toFixed(1)
            })
          }
        }

        // Process any remaining profiles in the batch
        if (profileBatch.length > 0) {
          const deployed = await enrichAndDeployProfiles(profileBatch)
          snapshotProfilesProcessed += deployed
          totalProfilesProcessed += deployed
        }

        // Mark snapshot as processed
        await db.markSnapshotProcessed(snapshotMeta.hash)
        snapshotsProcessedCount++

        logger.info('=== SNAPSHOT COMPLETED ===', {
          hash: snapshotMeta.hash.substring(0, 30),
          entitiesProcessed: snapshotEntitiesProcessed,
          profilesFound: snapshotProfilesProcessed,
          totalProfilesSoFar: totalProfilesProcessed,
          snapshotsCompleted: `${snapshotsProcessedCount}/${snapshotsToProcess.length}`
        })
      } catch (error: any) {
        logger.error('Failed to process snapshot', {
          hash: snapshotMeta.hash.substring(0, 30),
          error: error.message,
          stack: error.stack?.substring(0, 200)
        })
        // Continue with next snapshot
      }
    }

    // Wait for DB queue to drain
    await entityPersistent.waitForDrain()

    syncState.lastPointerChangesCheck = lastProcessedTimestamp
    await persistState()

    logger.info('=== SNAPSHOT BOOTSTRAP PHASE COMPLETE ===', {
      snapshotsProcessed: snapshotsProcessedCount,
      totalEntitiesProcessed,
      totalProfilesFound: totalProfilesProcessed,
      lastTimestamp: new Date(lastProcessedTimestamp).toISOString()
    })

    return lastProcessedTimestamp
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
    const profileBatch: Array<{ entityId: string; pointer: string; timestamp: number; authChain: any }> = []

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
      logger.debug('Syncing from pointer changes')

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
            const deployed = await enrichAndDeployProfiles(profileBatch)
            profilesProcessed += deployed
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
        const deployed = await enrichAndDeployProfiles(profileBatch)
        profilesProcessed += deployed
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
        lastTimestamp = await bootstrapFromSnapshots(fromTimestamp)
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

  async function runSyncWorkflow(): Promise<void> {
    if (!syncState.bootstrapComplete) {
      await bootstrapWithRetry()
    } else {
      logger.info('Bootstrap already complete, skipping to incremental sync', {
        lastPointerChangesCheck: new Date(syncState.lastPointerChangesCheck).toISOString()
      })
    }

    logger.info('Starting incremental sync loop')
    await runPointerChangesLoop()
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
        if (attempt === maxRetries) {
          throw new Error(`Database not ready after ${maxRetries} attempts: ${error.message}`)
        }
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
