import { Entity } from '@dcl/schemas'
// import { ContractNetwork, Entity } from '@dcl/schemas'
// import { getCatalystServersFromCache } from 'dcl-catalyst-client/dist/contracts-snapshots'

import { AppComponents, CatalystComponent } from '../types'
import { ContentClient, createContentClient } from 'dcl-catalyst-client'

export async function createCatalystAdapter({
  config,
  logs,
  fetch
}: Pick<AppComponents, 'config' | 'logs' | 'fetch'>): Promise<CatalystComponent> {
  const log = logs.getLogger('catalyst-client')
  const catalystLoadBalancer = await config.requireString('CATALYST_LOADBALANCER_HOST')

  // TODO: implement rotation
  //const loadBalancer = await config.requireString('CATALYST_LOADBALANCER_HOST')
  //const contractNetwork = (await config.getString('ENV')) === 'prod' ? ContractNetwork.MAINNET : ContractNetwork.SEPOLIA

  //const catalystServers: string[] = getCatalystServersFromCache(contractNetwork).map((server) => server.address)
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

  async function getEntityById(id: string, contentServerUrl?: string): Promise<Entity> {
    const contentClient = getContentClientOrDefault(contentServerUrl)
    log.debug('Fetching entity by id', { id })
    const entity = await contentClient.fetchEntityById(id)
    return entity
  }

  return { getEntityById }
}
