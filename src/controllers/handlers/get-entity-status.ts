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

type EntityStatusResponse = {
  complete: boolean
  lods: StatusPerPlatform
  assetBundles: StatusPerPlatform
  catalyst: 'complete' | 'pending'
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

  if (!entityId) {
    return {
      status: 400,
      body: {
        ok: false,
        message: 'No entity id provided'
      }
    }
  }

  const entity = await db.getRegistryById(entityId)

  if (isOwnedByUser(entity, userAddress)) {
    return {
      body: JSON.stringify({
        complete: entity?.status === Registry.StatusValues.OPTMIZED,
        // TODO: LODS status MOCKED
        lods: {
          mac: entity?.bundles.mac || Registry.StatusValues.PENDING,
          windows: entity?.bundles.mac || Registry.StatusValues.PENDING
        },
        assetBundles: {
          mac: entity?.bundles.mac || Registry.StatusValues.PENDING,
          windows: entity?.bundles.windows || Registry.StatusValues.PENDING
        },
        // TODO: Catalyst status MOCKED
        catalyst: 'complete'
      } as EntityStatusResponse),
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
    }
  }
}
