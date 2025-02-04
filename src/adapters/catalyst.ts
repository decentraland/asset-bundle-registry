import { Entity } from '@dcl/schemas'

import { AppComponents, CatalystComponent, CatalystFetchOptions } from '../types'
import { ContentClient, createContentClient } from 'dcl-catalyst-client'

export async function createCatalystAdapter({
  config,
  logs,
  fetch
}: Pick<AppComponents, 'config' | 'logs' | 'fetch'>): Promise<CatalystComponent> {
  const log = logs.getLogger('catalyst-client')
  const catalystLoadBalancer = await config.requireString('CATALYST_LOADBALANCER_HOST')

  const defaultContentClient = createContentClient({ fetcher: fetch, url: ensureContentUrl(catalystLoadBalancer) })

  function ensureContentUrl(url: string): string {
    return url.endsWith('/content') ? url : url + '/content'
  }

  function getContentClientOrDefault(contentServerUrl?: string): ContentClient {
    const contentClientToReturn = contentServerUrl
      ? createContentClient({
          fetcher: fetch,
          url: ensureContentUrl(contentServerUrl)
        })
      : defaultContentClient

    return contentClientToReturn
  }

  async function getEntityById(id: string, options?: CatalystFetchOptions): Promise<Entity | null> {
    try {
      const contentClient = getContentClientOrDefault(options?.overrideContentServerUrl)
      if (options?.parallelFetch && options?.parallelFetch.catalystServers.length > 0) {
        log.debug('Fetching entity by id in parallel', {
          id,
          servers: options.parallelFetch.catalystServers.join(', ')
        })
        const result = await contentClient.fetchEntityById(id, {
          parallel: {
            urls: options.parallelFetch.catalystServers.map((server) => ensureContentUrl(server))
          }
        })
        return result
      } else {
        log.debug('Fetching entity by id', { id })
        return await contentClient.fetchEntityById(id)
      }
    } catch (error: any) {
      log.error('Error fetching entity by id', { id, error: error?.message || 'Unknown error' })
      return null
    }
  }

  async function getEntitiesByIds(ids: string[], options?: CatalystFetchOptions): Promise<Entity[]> {
    try {
      const contentClient = getContentClientOrDefault(options?.overrideContentServerUrl)
      if (options?.parallelFetch && options?.parallelFetch.catalystServers.length > 0) {
        log.debug('Fetching entities by ids in parallel', {
          ids: ids.join(', '),
          servers: options.parallelFetch.catalystServers.join(', ')
        })
        const result = await contentClient.fetchEntitiesByIds(ids, {
          parallel: {
            urls: options.parallelFetch.catalystServers.map((server) => ensureContentUrl(server))
          }
        })
        return result
      } else {
        log.debug('Fetching entities by ids', { ids: ids.join(', ') })
        return await contentClient.fetchEntitiesByIds(ids)
      }
    } catch (error: any) {
      log.error('Error fetching entities by ids', { ids: ids.join(', '), error: error?.message || 'Unknown error' })
      return []
    }
  }

  async function getEntityByPointers(pointers: string[]): Promise<Entity[]> {
    return defaultContentClient.fetchEntitiesByPointers(pointers)
  }

  async function getContent(id: string): Promise<Entity | undefined> {
    const downloadedContent = await defaultContentClient.downloadContent(id)

    if (!downloadedContent) {
      return undefined
    }

    const contentString = downloadedContent.toString('utf-8')
    const contentJson = JSON.parse(contentString)
    return contentJson as Entity
  }

  return { getEntityById, getEntitiesByIds, getEntityByPointers, getContent }
}
