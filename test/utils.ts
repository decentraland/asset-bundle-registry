import { AuthChain, Authenticator, AuthIdentity, IdentityType } from '@dcl/crypto'
import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { AUTH_CHAIN_HEADER_PREFIX, AUTH_METADATA_HEADER, AUTH_TIMESTAMP_HEADER } from '@dcl/platform-crypto-middleware'
import { Registry, TestComponents } from '../src/types'
import { EntityType } from '@dcl/schemas'

export type Identity = {
  authChain: AuthIdentity
  realAccount: IdentityType
  ephemeralIdentity: IdentityType
}

export async function getIdentity(): Promise<Identity> {
  const ephemeralIdentity = createUnsafeIdentity()
  const realAccount = createUnsafeIdentity()

  const authChain = await Authenticator.initializeAuthChain(
    realAccount.address,
    ephemeralIdentity,
    10,
    async (message) => {
      return Authenticator.createSignature(realAccount, message)
    }
  )

  return { authChain, realAccount, ephemeralIdentity }
}

export function getAuthHeaders(
  method: string,
  path: string,
  metadata: Record<string, any>,
  chainProvider: (payload: string) => AuthChain
) {
  const headers: Record<string, string> = {}
  const timestamp = Date.now()
  const metadataJSON = JSON.stringify(metadata)
  const payloadParts = [method.toLowerCase(), path.toLowerCase(), timestamp.toString(), metadataJSON]
  const payloadToSign = payloadParts.join(':').toLowerCase()

  const chain = chainProvider(payloadToSign)

  chain.forEach((link, index) => {
    headers[`${AUTH_CHAIN_HEADER_PREFIX}${index}`] = JSON.stringify(link)
  })

  headers[AUTH_TIMESTAMP_HEADER] = timestamp.toString()
  headers[AUTH_METADATA_HEADER] = metadataJSON

  return headers
}

export function createRequestMaker({ localFetch }: Pick<TestComponents, 'localFetch'>) {
  function makeLocalRequest(
    method: string,
    path: string,
    identity: Identity,
    body: any,
    metadata: Record<string, any> = {}
  ) {
    let headers: Record<string, string> = {}

    if (identity) {
      headers = getAuthHeaders(method, path, metadata, (payload) =>
        Authenticator.signPayload(
          {
            ephemeralIdentity: identity.ephemeralIdentity,
            expiration: new Date(),
            authChain: identity.authChain.authChain
          },
          payload
        )
      )
    }

    return localFetch.fetch(path, {
      method: method,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })
  }

  return {
    makeLocalRequest
  }
}

export function createRegistryEntity(
  ownerAddress: string,
  status: Registry.Status,
  bundlesStatus: Registry.SimplifiedStatus,
  overrideProperties: Partial<Registry.DbEntity> = {}
): Registry.DbEntity {
  return {
    id: 'bafkreig6666666666666666666666666666666666666666666666666666666666666666',
    deployer: ownerAddress,
    status: status,
    bundles: {
      assets: {
        windows: bundlesStatus,
        mac: bundlesStatus,
        webgl: bundlesStatus
      },
      lods: {
        windows: bundlesStatus,
        mac: bundlesStatus,
        webgl: bundlesStatus
      }
    },
    pointers: ['1000,1000'], // out of scope pointer to avoid conflicts with entities
    timestamp: 0,
    content: [],
    type: EntityType.SCENE,
    versions: {
      assets: {
        windows: { version: '', buildDate: '' },
        mac: { version: '', buildDate: '' },
        webgl: { version: '', buildDate: '' }
      }
    },
    ...overrideProperties
  }
}
