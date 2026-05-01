import { IBaseComponent, IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { IConfigComponent } from '@well-known-components/interfaces'

export type IDenylistComponent = {
  isDenylisted: (entityId: string) => boolean
}

/**
 * Creates a denylist component that periodically fetches a list of denylisted entity IDs
 * from remote URLs and provides O(1) lookups.
 *
 * When a denylisted entity is requested, the handler should return an empty response
 * (same as if the entity doesn't exist) to avoid serving banned content.
 *
 * Performance: Uses an in-memory Set for O(1) lookups. Reloads every 2 minutes.
 * The denylist is typically small (< 1000 entries) so memory is not a concern.
 */
export async function createDenylistComponent(components: {
  config: IConfigComponent
  logs: ILoggerComponent
  fetch: IFetchComponent
}): Promise<IDenylistComponent & IBaseComponent> {
  const logger = components.logs.getLogger('Denylist')
  const deniedEntityIds = new Set<string>()

  const denylistUrlsRaw = (await components.config.getString('DENYLIST_URLS')) ?? ''
  const denylistUrls = denylistUrlsRaw
    .split(/[\r\n\s,]+/)
    .map((url) => url.trim())
    .filter((url) => {
      if (!url) return false
      try {
        new URL(url)
        return true
      } catch {
        logger.error(`Invalid denylist URL: ${url}`)
        return false
      }
    })

  if (denylistUrls.length === 0) {
    logger.info('No denylist URLs configured (DENYLIST_URLS). Denylist is disabled.')
  } else {
    logger.info(`Denylist URLs configured: ${denylistUrls.join(', ')}`)
  }

  async function loadDenylists() {
    if (denylistUrls.length === 0) return

    for (const url of denylistUrls) {
      try {
        const response = await components.fetch.fetch(url)
        if (!response.ok) {
          logger.error(`Failed to fetch denylist from ${url}: HTTP ${response.status}`)
          continue
        }
        const content = await response.text()
        const lines = content.split(/[\r\n]+/)
        let count = 0
        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.length > 0 && !trimmed.startsWith('#')) {
            deniedEntityIds.add(trimmed)
            count++
          }
        }
        logger.info(`Loaded ${count} entries from denylist: ${url}`)
      } catch (err: any) {
        logger.error(`Error fetching denylist from ${url}: ${err.message}`)
      }
    }

    logger.info(`Total denylisted entity IDs: ${deniedEntityIds.size}`)
  }

  let reloadTimer: ReturnType<typeof setInterval> | undefined

  return {
    isDenylisted(entityId: string): boolean {
      return deniedEntityIds.has(entityId)
    },

    async start() {
      await loadDenylists()
      // Reload every 2 minutes to pick up changes
      reloadTimer = setInterval(() => loadDenylists().catch((err) => logger.error(err)), 120_000)
    },

    async stop() {
      if (reloadTimer) {
        clearInterval(reloadTimer)
      }
    }
  }
}
