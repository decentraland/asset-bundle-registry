import { createPgComponent } from '@well-known-components/pg-component'
import { createLogComponent } from '@well-known-components/logger'
import { createFetchComponent } from '@well-known-components/fetch-component'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import SQL from 'sql-template-strings'

interface ManifestResponse {
  version: string
  files: string[]
  exitCode: number
  contentServerUrl: string
  date: string
}

interface PlatformResult {
  platform: string
  version: string | null
  buildDate: string | null
}

interface EntityResult {
  entityId: string
  versions: { assets: { [key: string]: { version: string; buildDate: string } } }
  hasAnyVersion: boolean
}

class RateLimiter {
  private lastRequestTime = 0
  private baseDelay = 100 // Increased to 100ms to be more respectful to CDN
  private consecutiveNetworkErrors = 0
  private maxConsecutiveNetworkErrors = 3

  async wait() {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime

    if (timeSinceLastRequest < this.baseDelay) {
      await new Promise((resolve) => setTimeout(resolve, this.baseDelay - timeSinceLastRequest))
    }

    this.lastRequestTime = now
  }

  async handleNetworkError(logger: any) {
    this.consecutiveNetworkErrors++

    if (this.consecutiveNetworkErrors >= this.maxConsecutiveNetworkErrors) {
      // Exponential backoff for network errors
      const backoffDelay = Math.min(
        2000 * Math.pow(2, this.consecutiveNetworkErrors - this.maxConsecutiveNetworkErrors),
        60000
      )
      logger.warn(`Multiple network errors detected, backing off for ${backoffDelay}ms`)
      await new Promise((resolve) => setTimeout(resolve, backoffDelay))
      this.consecutiveNetworkErrors = 0 // Reset after backoff
    }
  }

  resetNetworkErrorCount() {
    this.consecutiveNetworkErrors = 0
  }
}

async function fetchManifestForPlatform(
  entityId: string,
  platform: string,
  cdnBaseUrl: string,
  fetch: any,
  rateLimiter: RateLimiter,
  logger: any
): Promise<PlatformResult> {
  await rateLimiter.wait()

  const manifestName = platform !== 'webgl' ? `${entityId}_${platform}` : entityId
  const manifestUrl = `${cdnBaseUrl}/${manifestName}.json`

  const maxRetries = 3
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch.fetch(manifestUrl)

      if (response.ok) {
        const manifest: ManifestResponse = await response.json()
        if (manifest.version) {
          logger.debug(`Found version ${manifest.version} for entity ${entityId} on platform ${platform}`)
          rateLimiter.resetNetworkErrorCount() // Reset on success
          return {
            platform,
            version: manifest.version,
            buildDate: manifest.date || ''
          }
        }
      } else if (response.status === 404 || response.status === 403) {
        // Treat both 404 and 403 as "manifest not found"
        logger.debug(`Manifest not found for entity ${entityId} on platform ${platform} (HTTP ${response.status})`)
        break // No need to retry for these status codes
      } else {
        logger.warn(`HTTP ${response.status} for entity ${entityId} on platform ${platform}`)
        break // No need to retry for other HTTP errors
      }
    } catch (error: any) {
      lastError = error

      // Check if it's a network error (socket hang up, timeout, etc.)
      if (
        error.message.includes('socket hang up') ||
        error.message.includes('timeout') ||
        error.message.includes('ECONNRESET') ||
        error.message.includes('ENOTFOUND')
      ) {
        logger.warn(
          `Network error on attempt ${attempt}/${maxRetries} for entity ${entityId} on platform ${platform}: ${error.message}`
        )

        if (attempt < maxRetries) {
          await rateLimiter.handleNetworkError(logger)
          continue // Retry
        }
      } else {
        // Non-network error, don't retry
        logger.debug(`Non-network error for entity ${entityId} on platform ${platform}: ${error.message}`)
        break
      }
    }
  }

  // If we get here, all retries failed or it's a non-retryable error
  if (lastError && lastError.message.includes('socket hang up')) {
    logger.error(
      `Failed to fetch manifest for entity ${entityId} on platform ${platform} after ${maxRetries} attempts: ${lastError.message}`
    )
  }

  return { platform, version: null, buildDate: null }
}

async function processEntity(
  entityId: string,
  cdnBaseUrl: string,
  fetch: any,
  rateLimiter: RateLimiter,
  logger: any
): Promise<EntityResult> {
  // Fetch all platforms simultaneously for this entity
  const platformPromises = ['webgl', 'windows', 'mac'].map(async (platform) => {
    return fetchManifestForPlatform(entityId, platform, cdnBaseUrl, fetch, rateLimiter, logger)
  })

  const results = await Promise.all(platformPromises)

  const versions: { assets: { [key: string]: { version: string; buildDate: string } } } = { assets: {} }
  let hasAnyVersion = false

  // Always set all platforms, even if empty
  for (const result of results) {
    versions.assets[result.platform] = {
      version: result.version || '',
      buildDate: result.buildDate || ''
    }

    if (result.version) {
      hasAnyVersion = true
    }
  }

  return { entityId, versions, hasAnyVersion }
}

async function processBatch(
  batch: string[],
  cdnBaseUrl: string,
  fetch: any,
  logger: any
): Promise<Array<{ id: string; versions: any }>> {
  const updates: Array<{ id: string; versions: any }> = []

  // Process entities in smaller chunks to avoid overwhelming CDN
  const CHUNK_SIZE = 10 // Process 10 entities simultaneously
  const results: EntityResult[] = []

  for (let i = 0; i < batch.length; i += CHUNK_SIZE) {
    const chunk = batch.slice(i, i + CHUNK_SIZE)

    // Process chunk in parallel
    const chunkPromises = chunk.map(async (entityId) => {
      const rateLimiter = new RateLimiter()
      return processEntity(entityId, cdnBaseUrl, fetch, rateLimiter, logger)
    })

    const chunkResults = await Promise.all(chunkPromises)
    results.push(...chunkResults)

    // Small delay between chunks to be respectful
    if (i + CHUNK_SIZE < batch.length) {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  for (const result of results) {
    updates.push({ id: result.entityId, versions: result.versions })
  }

  return updates
}

async function batchUpdateVersions(updates: Array<{ id: string; versions: any }>, tableName: string, pg: any) {
  if (updates.length === 0) return

  // Use individual UPDATE statements instead of complex batch update
  for (const update of updates) {
    const query = SQL`UPDATE `
      .append(tableName)
      .append(SQL` SET versions = ${JSON.stringify(update.versions)}::jsonb WHERE id = ${update.id}`)
    await pg.query(query)
  }
}

async function main() {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })
  const logs = await createLogComponent({ config })
  const pg = await createPgComponent({ logs, config })
  const fetch = await createFetchComponent()
  const logger = logs.getLogger('backfill-versions')

  // const CDN_BASE_URL = 'https://ab-cdn-decentraland-zone-contentbucket-69c62a7.s3.us-east-1.amazonaws.com/manifest'
  const CDN_BASE_URL = 'https://ab-cdn-decentraland-today-contentbucket-58ff735.s3.us-east-1.amazonaws.com/manifest'
  // const CDN_BASE_URL = 'https://ab-cdn-decentraland-org-contentbucket-4e8caab.s3.us-east-1.amazonaws.com/manifest'
  const TABLE_NAMES = ['registries', 'historical_registries']

  // Optimized batch processing with network error handling
  const BATCH_SIZE = 200 // Increased for faster processing
  const CONCURRENT_BATCHES = 1
  const DB_UPDATE_THRESHOLD = 200 // Update less frequently for better performance

  logger.info('Starting optimized version backfill')
  logger.info(`Configuration: Batch size: ${BATCH_SIZE}, Concurrent batches: ${CONCURRENT_BATCHES}`)

  for (const tableName of TABLE_NAMES) {
    logger.info(`Processing table ${tableName}`)

    // Only process entities that don't have versions at all
    const query = SQL`SELECT id FROM `.append(tableName).append(SQL` WHERE versions IS NULL ORDER BY id`)

    const result = await pg.query(query)
    const entityIds = result.rows.map((row) => row.id)

    logger.info(`Found ${entityIds.length} entities to process`)

    if (entityIds.length === 0) {
      logger.info(`Table ${tableName} already up to date, skipping`)
      continue
    }

    let totalUpdated = 0
    let totalErrors = 0
    const updates: Array<{ id: string; versions: any }> = []
    const startTime = Date.now()

    // Process batches sequentially to avoid overwhelming the CDN
    for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
      const batch = entityIds.slice(i, i + BATCH_SIZE)

      try {
        const batchResults = await processBatch(batch, CDN_BASE_URL, fetch, logger)

        // All entities now get versions (even if empty), so add them all to updates
        updates.push(...batchResults.map((result) => ({ id: result.id, versions: result.versions })))
        totalUpdated += batchResults.length

        // Update database when threshold is reached
        if (updates.length >= DB_UPDATE_THRESHOLD) {
          try {
            await batchUpdateVersions(updates, tableName, pg)
            logger.info(`Batch updated ${updates.length} entities (Total: ${totalUpdated})`)
            updates.length = 0
          } catch (error: any) {
            logger.error(`Error in batch update: ${error.message}`)
            totalErrors++
          }
        }

        // Progress logging with time estimation
        const progress = Math.min(i + BATCH_SIZE, entityIds.length)
        const percentage = ((progress / entityIds.length) * 100).toFixed(1)
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)

        // Estimate remaining time
        const remainingEntities = entityIds.length - progress
        const entitiesPerSecond = progress / parseFloat(elapsed)
        const estimatedSeconds = entitiesPerSecond > 0 ? (remainingEntities / entitiesPerSecond).toFixed(0) : 'unknown'
        const estimatedMinutes = entitiesPerSecond > 0 ? (parseFloat(estimatedSeconds) / 60).toFixed(1) : 'unknown'

        logger.info(
          `Progress: ${progress}/${entityIds.length} (${percentage}%) - Elapsed: ${elapsed}s - ETA: ~${estimatedMinutes} minutes`
        )

        // Delay between batches to be respectful to CDN
        await new Promise((resolve) => setTimeout(resolve, 200))
      } catch (error: any) {
        logger.error(`Error processing batch starting at index ${i}: ${error.message}`)
        totalErrors++
      }
    }

    // Final batch update
    if (updates.length > 0) {
      try {
        await batchUpdateVersions(updates, tableName, pg)
        logger.info(`Final batch updated ${updates.length} entities`)
      } catch (error: any) {
        logger.error(`Error in final batch update: ${error.message}`)
        totalErrors++
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(0)
    logger.info(
      `Table ${tableName} completed in ${totalTime}s. Total Updated: ${totalUpdated}, Total Errors: ${totalErrors}`
    )
  }

  logger.info('All tables processed successfully!')
}

// Run the script
main().catch((error) => {
  console.error('Backfill failed:', error)
  process.exit(1)
})
