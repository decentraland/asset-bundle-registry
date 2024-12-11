import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath } from '../../types'
import { EthAddress } from '@dcl/schemas'

export async function getEntitiesStatusHandler(
  context: HandlerContextWithPath<'db' | 'entityStatusAnalyzer', '/entities/status'> & DecentralandSignatureContext<any>
) {
  const {
    components: { db, entityStatusAnalyzer },
    verification
  } = context

  const userAddress: EthAddress = verification!.auth

  const entities = await db.getRegistriesByOwner(userAddress)

  if (entities) {
    const promises = entities
      .filter((entity) => entityStatusAnalyzer.isOwnedBy(entity, userAddress))
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(async (entity) => entityStatusAnalyzer.getEntityStatus(entity))

    const response = await Promise.all(promises)

    return {
      body: JSON.stringify(response),
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
