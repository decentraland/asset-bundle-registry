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

export async function getEntityStatusHandler(context: HandlerContextWithPath<'db', '/entities/status/:id'>) {
  const {
    params,
    components: { db }
  } = context

  const idOrPointer: string | undefined = params.id

  // Extract world_name from query parameters
  const worldName = context.url.searchParams.get('world_name') || undefined

  const entity =
    (await db.getRegistryById(idOrPointer)) ||
    (await db.getHistoricalRegistryById(idOrPointer)) ||
    // in case a pointer was provided:
    (await db.getSortedRegistriesByPointers([idOrPointer], undefined, true, worldName))[0] // if found, we kept the most recent registry ([0])

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

  if (!EthAddress.validate(userAddress)) {
    return {
      status: 400,
      body: { ok: false, message: 'Invalid user address' },
      headers: { 'Content-Type': 'application/json' }
    }
  }

  const parsedUserAddress = userAddress.toLocaleLowerCase()

  const [entities, historicalEntities] = await Promise.all([
    db.getSortedRegistriesByOwner(parsedUserAddress),
    db.getSortedHistoricalRegistriesByOwner(parsedUserAddress)
  ])

  const parsedEntitiesStatuses = [...entities, ...historicalEntities].map((entity) => parseRegistryStatus(entity))

  return {
    body: JSON.stringify(parsedEntitiesStatuses),
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
