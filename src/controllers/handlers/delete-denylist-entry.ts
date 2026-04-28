import { DecentralandSignatureContext } from '@dcl/platform-crypto-middleware'
import { HandlerContextWithPath } from '../../types'

export async function deleteDenylistEntryHandler(
  context: HandlerContextWithPath<'db' | 'refreshableFeatures', '/denylist/:entityId'> &
    DecentralandSignatureContext<any>
) {
  const {
    components: { db, refreshableFeatures },
    params,
    verification
  } = context

  const { entityId } = params
  if (!entityId) {
    return {
      status: 400,
      body: { ok: false, message: 'Entity ID is required' }
    }
  }

  const signerAddress = verification!.auth.toLowerCase()
  const moderators = await refreshableFeatures.getUserModerators()

  if (!moderators || !moderators.includes(signerAddress)) {
    return {
      status: 403,
      body: { ok: false, message: 'Forbidden: signer is not an authorized moderator' }
    }
  }

  const deleted = await db.removeDenylistEntry(entityId)
  if (!deleted) {
    return {
      status: 404,
      body: { ok: false, message: 'Entity ID not found in denylist' }
    }
  }

  return {
    status: 200,
    body: { ok: true }
  }
}
