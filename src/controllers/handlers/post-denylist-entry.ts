import { DecentralandSignatureContext } from '@dcl/crypto-middleware'
import { HandlerContextWithPath } from '../../types'

export async function postDenylistEntryHandler(
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

  const body = await context.request.json().catch(() => ({}))
  const reason: string | null = body?.reason ?? null

  const entry = await db.addDenylistEntry(entityId, signerAddress, reason)

  return {
    status: 201,
    body: entry
  }
}
