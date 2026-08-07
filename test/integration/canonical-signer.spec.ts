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
    // The canonical payload is lowercased before signing, so a metadata value differing only in
    // case shares the signature. Overwriting the header after signing leaves the request genuinely
    // authentic while reading differently to any case-sensitive comparison downstream. This is the
    // attack, not a mock: nothing here weakens the signature.
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

    // Without this guard the mixed-case spelling fails the strict `!== 'decentraland-kernel-scene'`
    // check in routes.ts, so the scene request is read as a directly user-signed one and served.
    expect(response.status).toBe(400)
    // The raw metadata is echoed back truncated at 64 characters, so match the prefix.
    expect(parsedResponse.error).toMatch(/^Invalid chain metadata: /)
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
