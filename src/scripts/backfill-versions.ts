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

async function main() {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })
  const logs = await createLogComponent({ config })
  const pg = await createPgComponent({ logs, config })
  const fetch = await createFetchComponent()
  const logger = logs.getLogger('backfill-versions')

  // const CDN_BASE_URL = 'https://ab-cdn-decentraland-zone-contentbucket-69c62a7.s3.us-east-1.amazonaws.com/manifest'
  // const CDN_BASE_URL = 'https://ab-cdn-decentraland-today-contentbucket-58ff735.s3.us-east-1.amazonaws.com/manifest'
  const CDN_BASE_URL = 'https://ab-cdn-decentraland-org-contentbucket-4e8caab.s3.us-east-1.amazonaws.com/manifest'

  const TABLE_NAMES = ['registries', 'historical_registries']

  const PLATFORMS = ['webgl', 'windows', 'mac']

  logger.info('Starting version backfill')

  for (const tableName of TABLE_NAMES) {
    logger.info(`Processing table ${tableName}`)

    try {
      // Get all entity IDs without versions
      const query = SQL`SELECT id FROM `
        .append(tableName)
        .append(SQL` WHERE versions IS NULL OR versions = '{}'::jsonb ORDER BY id`)

      const result = await pg.query(query)
      const entityIds = result.rows.map((row) => row.id)

      logger.info(`Found ${entityIds.length} entities to process`)

      let totalUpdated = 0
      let totalErrors = 0

      // Process each entity
      for (const entityId of entityIds) {
        try {
          const versions: { assets: { [key: string]: { version: string; buildDate: string } } } = { assets: {} }
          let hasAnyVersion = false

          // Fetch versions for each platform
          for (const platform of PLATFORMS) {
            try {
              const manifestName = platform !== 'webgl' ? `${entityId}_${platform}` : entityId
              const manifestUrl = `${CDN_BASE_URL}/${manifestName}.json`

              const response = await fetch.fetch(manifestUrl)

              if (response.ok) {
                const manifest: ManifestResponse = await response.json()

                if (manifest.version) {
                  versions.assets[platform] = {
                    version: manifest.version,
                    buildDate: manifest.date
                  }
                  hasAnyVersion = true
                  logger.info(
                    `Found version ${manifest.version} with build date ${manifest.date} for entity ${entityId} on platform ${platform}`
                  )
                }
              } else if (response.status === 404) {
                logger.warn(`Manifest not found for entity ${entityId} on platform ${platform}`)
              } else {
                logger.warn(`HTTP ${response.status} for entity ${entityId} on platform ${platform}`)
              }
            } catch (error: any) {
              logger.warn(`Error fetching manifest for entity ${entityId} on platform ${platform}: ${error.message}`)
            }

            // Small delay between platform requests
            await new Promise((resolve) => setTimeout(resolve, 50))
          }

          if (hasAnyVersion) {
            // Update database with versions
            logger.info(`Updating entity ${entityId} with versions: ${JSON.stringify(versions)}`)

            await pg.query(
              SQL`UPDATE `
                .append(tableName)
                .append(SQL` SET versions = ${JSON.stringify(versions)}::jsonb WHERE id = ${entityId}`)
            )

            totalUpdated++
            logger.info(`Updated entity ${entityId} with versions`)
          } else {
            logger.warn(`No versions found for entity ${entityId} on any platform`)
          }

          // Small delay to be nice to the CDN
          await new Promise((resolve) => setTimeout(resolve, 100))
        } catch (error: any) {
          totalErrors++
          logger.error(`Error processing entity ${entityId}:`, error)
        }
      }

      logger.info(`Backfill completed. Total Updated: ${totalUpdated}, Total Errors: ${totalErrors}`)
    } catch (error: any) {
      logger.error('Backfill failed:', error)
      throw error
    }
  }
}

// Run the script
main().catch(console.error)
