import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { EntityStatus, HandlerContextWithPath, Registry } from '../../types'
import { EthAddress } from '@dcl/schemas'

function parseRegistryStatus(registry: Registry.DbEntity): EntityStatus {
  const assetBundles = {
    mac: registry.bundles.assets.mac || Registry.SimplifiedStatus.PENDING,
    windows: registry.bundles.assets.windows || Registry.SimplifiedStatus.PENDING
  }
  const lods = {
    mac: registry.bundles.lods.mac || Registry.SimplifiedStatus.PENDING,
    windows: registry.bundles.lods.windows || Registry.SimplifiedStatus.PENDING
  }

  const isComplete =
    assetBundles.mac === Registry.SimplifiedStatus.COMPLETE &&
    assetBundles.windows === Registry.SimplifiedStatus.COMPLETE

  return {
    entityId: registry.id,
    catalyst: Registry.SimplifiedStatus.COMPLETE, // if there is a registry, it was already uploaded to catalyst
    complete: isComplete,
    assetBundles,
    lods
  }
}

function isOwnedBy(registry: Registry.DbEntity | null, userAddress: string): boolean {
  return !!registry && registry.deployer.toLocaleLowerCase() === userAddress.toLocaleLowerCase()
}

export async function getEntityStatusHandler(
  context: HandlerContextWithPath<'db', '/entities/status/:id'> & DecentralandSignatureContext<any>
) {
  const {
    params,
    components: { db },
    verification
  } = context

  const entityId: string | undefined = params.id
  const userAddress: EthAddress = verification!.auth

  const entity = (await db.getRegistryById(entityId)) || (await db.getHistoricalRegistryById(entityId))

  if (entity && isOwnedBy(entity, userAddress)) {
    const entityStatus = parseRegistryStatus(entity)
    return {
      body: JSON.stringify(entityStatus),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  }

  return {
    status: 404,
    body: {
      ok: false,
      message: 'No active entity found for the provided id'
    },
    headers: {
      'Content-Type': 'application/json'
    }
  }
}

export async function getEntitiesStatusHandler(
  context: HandlerContextWithPath<'db', '/entities/status'> & DecentralandSignatureContext<any>
) {
  const {
    components: { db },
    verification
  } = context

  const userAddress: EthAddress = verification!.auth

  const entities = (await db.getSortedRegistriesByOwner(userAddress)) || []
  const parsedEntitiesStatuses = await Promise.all(entities.map((entity) => parseRegistryStatus(entity)))
  const historicalEntities = (await db.getSortedHistoricalRegistriesByOwner(userAddress)) || []
  const parsedHistoricalEntitiesStatuses = await Promise.all(
    historicalEntities.map((historicalEntity) => parseRegistryStatus(historicalEntity))
  )

  return {
    body: JSON.stringify([...parsedEntitiesStatuses, ...parsedHistoricalEntitiesStatuses]),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}

export async function getQueuesStatuses(context: HandlerContextWithPath<'memoryStorage', '/queues/status'>) {
  const {
    components: { memoryStorage }
  } = context

  const platforms: string[] = ['windows', 'mac', 'webgl']

  const [windowsPendingJobs, macPendingJobs, webglPendingJobs] = await Promise.all(
    platforms.map(async (platform) => await memoryStorage.get(`jobs:${platform}:*`))
  )

  return {
    status: 200,
    body: {
      windowsPendingJobs,
      macPendingJobs,
      webglPendingJobs
    },
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
