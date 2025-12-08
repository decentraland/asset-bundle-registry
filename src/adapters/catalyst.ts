import { Entity } from '@dcl/schemas'

import { AppComponents, ICatalystComponent, CatalystFetchOptions } from '../types'
import { ContentClient, createContentClient, createLambdasClient } from 'dcl-catalyst-client'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

export async function createCatalystAdapter({
  config,
  logs,
  fetch
}: Pick<AppComponents, 'config' | 'logs' | 'fetch'>): Promise<ICatalystComponent> {
  const log = logs.getLogger('catalyst-client')
  const catalystLoadBalancer = await config.requireString('CATALYST_LOADBALANCER_HOST')

  const defaultContentClient = createContentClient({ fetcher: fetch, url: ensureContentUrl(catalystLoadBalancer) })
  const defaultLambdasClient = createLambdasClient({ fetcher: fetch, url: ensureLambdasUrl(catalystLoadBalancer) })

  function ensureContentUrl(url: string): string {
    return url.endsWith('/content') ? url : url + '/content'
  }

  function ensureLambdasUrl(url: string): string {
    return url.endsWith('/lambdas') ? url : url + '/lambdas'
  }

  function withBatches<T extends string[]>(
    fn: (items: T, ...args: any[]) => Promise<Entity[]>,
    batchSize: number = 50
  ): (items: T, ...args: any[]) => Promise<Entity[]> {
    return async (items: T, ...args: any[]): Promise<Entity[]> => {
      if (items.length <= batchSize) {
        return fn(items, ...args)
      }

      const batches: T[] = []
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize) as T)
      }

      const results: Entity[] = []
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        const batchResults = await fn(batch, ...args)
        results.push(...batchResults)
      }
      return results
    }
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
        const result = await contentClient.fetchEntityById(id, {
          parallel: {
            urls: options.parallelFetch.catalystServers.map((server) => ensureContentUrl(server))
          }
        })
        return result
      } else {
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
        const result = await contentClient.fetchEntitiesByIds(ids, {
          parallel: {
            urls: options.parallelFetch.catalystServers.map((server) => ensureContentUrl(server))
          }
        })
        return result
      } else {
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

  async function getProfiles(pointers: string[]): Promise<Profile[]> {
    if (pointers.length === 0) {
      return []
    }

    try {
      const profiles = await defaultLambdasClient.getAvatarsDetailsByPost({ ids: pointers })
      const profilesWithAvatars = profiles.filter(
        (profile) => profile.avatars && profile.avatars.length > 0 && profile.avatars[0].ethAddress
      )
      return profilesWithAvatars
    } catch (error: any) {
      log.error('Error fetching sanitized profiles from lamb2', {
        error: error?.message || 'Unknown error',
        count: pointers.length
      })
      return []
    }
  }

  return {
    getEntityById,
    getEntitiesByIds: withBatches(getEntitiesByIds),
    getEntityByPointers: withBatches(getEntityByPointers),
    getContent,
    getProfiles
  }
}
