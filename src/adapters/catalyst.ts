import { Entity, EntityType } from '@dcl/schemas'
import { ContentClient, createContentClient, createLambdasClient } from 'dcl-catalyst-client'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

import { AppComponents, ICatalystComponent, CatalystFetchOptions } from '../types'

const ENTITY_ID_FROM_SNAPSHOT_REGEX = /\/entities\/([^/]+)\//

export async function createCatalystAdapter({
  config,
  logs,
  fetch
}: Pick<AppComponents, 'config' | 'logs' | 'fetch'>): Promise<ICatalystComponent> {
  const logger = logs.getLogger('catalyst-client')

  const catalystLoadBalancer = await config.requireString('CATALYST_LOADBALANCER_HOST')
  const defaultContentClient = createContentClient({ fetcher: fetch, url: ensureContentUrl(catalystLoadBalancer) })

  // We use a historical catalyst (instead of the load balancer) because some official nodes
  // have garbage-collected old profiles. The historical catalyst retains all profile data
  const historicalCatalyst = await config.requireString('CATALYST_WITH_HISTORICAL_INFORMATION')
  const historicalLambdasClient = createLambdasClient({ fetcher: fetch, url: ensureLambdasUrl(historicalCatalyst) })

  function extractEntityIdFromSnapshotUrl(snapshotUrl: string): string | null {
    const match = snapshotUrl.match(ENTITY_ID_FROM_SNAPSHOT_REGEX)
    return match ? match[1] : null
  }

  function convertLambdasProfileToEntity(profile: Profile): Entity | null {
    const avatar = profile.avatars?.[0]
    if (!avatar?.ethAddress) {
      return null
    }

    const snapshotUrl = avatar.avatar?.snapshots?.body || avatar.avatar?.snapshots?.face256
    if (!snapshotUrl) {
      logger.warn('Profile has no snapshot URL to extract entity ID', { pointer: avatar.ethAddress })
      return null
    }

    const entityId = extractEntityIdFromSnapshotUrl(snapshotUrl)
    if (!entityId) {
      logger.warn('Could not extract entity ID from snapshot URL', { snapshotUrl, pointer: avatar.ethAddress })
      return null
    }

    return {
      version: 'v3',
      id: entityId,
      type: EntityType.PROFILE,
      pointers: [avatar.ethAddress.toLowerCase()],
      timestamp: profile.timestamp!,
      content: [],
      metadata: { avatars: profile.avatars }
    }
  }

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
      logger.error('Error fetching entity by id', { id, error: error?.message || 'Unknown error' })
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
      logger.error('Error fetching entities by ids', { ids: ids.join(', '), error: error?.message || 'Unknown error' })
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
      const profiles = await historicalLambdasClient.getAvatarsDetailsByPost({ ids: pointers })
      const profilesWithAvatars = profiles.filter(
        (profile) => profile.avatars && profile.avatars.length > 0 && profile.avatars[0].ethAddress
      )
      return profilesWithAvatars
    } catch (error: any) {
      logger.error('Error fetching profiles from historical catalyst lambdas', {
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
    getProfiles,
    convertLambdasProfileToEntity
  }
}
