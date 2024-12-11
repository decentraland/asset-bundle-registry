import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath } from '../../types'
import { EthAddress } from '@dcl/schemas'

export async function getEntityStatusHandler(
  context: HandlerContextWithPath<'db' | 'entityStatusAnalyzer', '/entities/status/:id'> & DecentralandSignatureContext<any>
) {
  const {
    params,
    components: { db, entityStatusAnalyzer },
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

  if (entity && entityStatusAnalyzer.isOwnedBy(entity, userAddress)) {
    const entityStatus = await entityStatusAnalyzer.getEntityStatus(entity)
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
    }
  }
}
