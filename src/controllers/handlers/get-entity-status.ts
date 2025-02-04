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
    lods: registry.type === 'world' ? undefined : lods // worlds don't have lods
  }
}

export async function getEntityStatusHandler(context: HandlerContextWithPath<'db', '/entities/status/:id'>) {
  const {
    params,
    components: { db }
  } = context

  const idOrPointer: string | undefined = params.id

  const entity =
    (await db.getRegistryById(idOrPointer)) ||
    (await db.getHistoricalRegistryById(idOrPointer)) ||
    (await db.getSortedRegistriesByPointers([idOrPointer]))[0] // if found, we kept the most recent registry ([0])

  if (entity) {
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
      message: 'No active entity found for the provided id or pointer'
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

export async function getQueuesStatuses(context: HandlerContextWithPath<'queuesStatusManager', '/queues/status'>) {
  const {
    components: { queuesStatusManager }
  } = context

  async function getEntitiesIdsOfPendingJobs(platform: 'windows' | 'mac' | 'webgl') {
    return (await queuesStatusManager.getAllPendingEntities(platform)).map((pendingJob) => pendingJob.entityId)
  }

  const windowsPendingJobs = await getEntitiesIdsOfPendingJobs('windows')
  const macPendingJobs = await getEntitiesIdsOfPendingJobs('mac')
  const webglPendingJobs = await getEntitiesIdsOfPendingJobs('webgl')

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
