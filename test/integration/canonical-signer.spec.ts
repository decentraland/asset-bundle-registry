import { Authenticator } from '@dcl/crypto'
import { AUTH_METADATA_HEADER } from '@dcl/crypto-middleware'
import { test } from '../components'
import { createRequestMaker, getAuthHeaders, getIdentity, Identity } from '../utils'

const SIGNED_METADATA = { signer: 'decentraland-kernel-scene' }
const DELIVERED_METADATA = JSON.stringify({ signer: 'Decentraland-Kernel-Scene' })

test('GET /entities/status with a scene signer', function ({ components }) {
  let identity: Identity
  let fetchLocally: any

  beforeAll(async function () {
    const { makeLocalRequest } = createRequestMaker(components)
    fetchLocally = makeLocalRequest
  })

  beforeEach(async function () {
    identity = await getIdentity()
  })

  it('should reject a request that signed the canonical signer but delivered a mixed-case spelling', async function () {
    // The signed payload joins the metadata verbatim, so its casing is covered by the signature.
    // Overwriting the header after signing therefore changes the bytes the signature was produced
    // over: the request no longer verifies, and it is refused before any case-sensitive comparison
    // downstream can be reached. This is the attack, not a mock: nothing here weakens the signature.
    const headers = getAuthHeaders('GET', '/entities/status', SIGNED_METADATA, (payload) =>
      Authenticator.signPayload(
        {
          ephemeralIdentity: identity.ephemeralIdentity,
          expiration: new Date(),
          authChain: identity.authChain.authChain
        },
        payload
      )
    )
    headers[AUTH_METADATA_HEADER] = DELIVERED_METADATA

    const response = await components.localFetch.fetch('/entities/status', { method: 'GET', headers })
    const parsedResponse = await response.json()

    // Two layers refuse this and the earlier one wins. `rejectIfSigner` refuses a signer that is
    // not already canonical, and `metadataValidator` runs before signature verification, so the
    // gate answers first with a 400. Re-casing after signing also breaks the signature, which
    // would produce a 401 a step later, but it never gets that far. Were neither in place, the
    // mixed-case spelling would fail a strict `!== 'decentraland-kernel-scene'` comparison and the
    // scene request would be read as a directly user-signed one.
    expect(response.status).toBe(400)
    expect(parsedResponse.error).toMatch(/^Invalid metadata content: /)
  })

  it('should reject a request that delivers the canonical signer exactly as signed', async function () {
    const response = await fetchLocally('GET', '/entities/status', identity, undefined, SIGNED_METADATA)
    const parsedResponse = await response.json()

    expect(response.status).toBe(400)
    expect(parsedResponse.error).toMatch(/^Invalid metadata content: /)
  })

  it('should authenticate a request carrying no signer at all', async function () {
    const response = await fetchLocally('GET', '/entities/status', identity)
    const parsedResponse = await response.json()

    // Ordinary user traffic must be untouched by the guard: this gets all the way to the handler,
    // which reports no registries for this freshly generated identity.
    expect(response.status).toBe(200)
    expect(parsedResponse).toEqual([])
  })
})
