import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath, Registry } from '../../types'
import { EthAddress } from '@dcl/schemas'

function isOwnedByUser(entity: Registry.DbEntity | null, userAddress: EthAddress): boolean {
  console.log({ entity: JSON.stringify(entity), userAddress })
  return !!entity && entity.deployer.toLocaleLowerCase() === userAddress.toLocaleLowerCase()
}

type StatusPerPlatform = {
  mac: Registry.StatusValues
  windows: Registry.StatusValues
}

type EntitiesStatusResponse = {
  id: string
  complete: boolean
  lods: StatusPerPlatform
  assetBundles: StatusPerPlatform
  catalyst: 'complete' | 'pending'
}[]

export async function getEntitiesStatusHandler(
  context: HandlerContextWithPath<'db', '/entities/status'> & DecentralandSignatureContext<any>
) {
  const {
    components: { db },
    verification
  } = context

  const userAddress: EthAddress = verification!.auth

  const entities = await db.getRegistriesByOwner(userAddress)

  if (entities) {
    const response = entities
      .filter((entity) => isOwnedByUser(entity, userAddress))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((entity) => ({
        id: entity.id,
        complete: entity.status === Registry.StatusValues.OPTMIZED,
        lods: {
          mac: entity.bundles.mac || Registry.StatusValues.PENDING,
          windows: entity.bundles.mac || Registry.StatusValues.PENDING
        },
        assetBundles: {
          mac: entity.bundles.mac || Registry.StatusValues.PENDING,
          windows: entity.bundles.windows || Registry.StatusValues.PENDING
        },
        catalyst: 'complete'
      }))

    return {
      body: JSON.stringify(response as EntitiesStatusResponse),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  }

  return {
    status: 404,
    body: {
      ok: false,
      message: 'No active entities found for the provided id'
    }
  }
}
