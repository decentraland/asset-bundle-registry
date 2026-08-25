import { getSignedAuthHeaders, type Identity } from '@dcl/test-helpers'
import { Registry, TestComponents } from '../src/types'
import { EntityType } from '@dcl/schemas'

export { getAuthHeaders, getIdentity } from '@dcl/test-helpers'
export type { Identity } from '@dcl/test-helpers'

export function createRequestMaker({ localFetch }: Pick<TestComponents, 'localFetch'>) {
  function makeLocalRequest(
    method: string,
    path: string,
    identity: Identity,
    body: any,
    metadata: Record<string, any> = {},
    queryParams?: Record<string, string>
  ) {
    let headers: Record<string, string> = {}
    let url = path

    // Add query parameters if provided
    if (queryParams) {
      const params = new URLSearchParams(queryParams)
      const queryString = params.toString()
      if (queryString) {
        url = `${path}${path.includes('?') ? '&' : '?'}${queryString}`
      }
    }

    if (identity) {
      headers = getSignedAuthHeaders(method, path, metadata, identity)
    }

    return localFetch.fetch(url, {
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
        mac: bundlesStatus
      },
      lods: {
        windows: bundlesStatus,
        mac: bundlesStatus
      }
    },
    pointers: ['1000,1000'], // out of scope pointer to avoid conflicts with entities
    timestamp: 0,
    content: [],
    type: EntityType.SCENE,
    metadata: {
      id: 'urn:decentraland:matic:collections-v2:0xc64642b53a67e98c6d9c42045e8356630e3accca:3',
      data: {
        tags: ['Nikki', 'Fuego', 'Draco', 'Handwear', 'Hands'],
        hides: ['hands'],
        category: 'hands_wear',
        replaces: [],
        representations: [
          {
            contents: ['male/fuegoHandsFinal.glb'],
            mainFile: 'male/fuegoHandsFinal.glb',
            bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'],
            overrideHides: ['hands'],
            overrideReplaces: []
          },
          {
            contents: ['female/fuegoHandsFinal.glb'],
            mainFile: 'female/fuegoHandsFinal.glb',
            bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseFemale'],
            overrideHides: ['hands'],
            overrideReplaces: []
          }
        ],
        removesDefaultHiding: []
      },
      i18n: [
        {
          code: 'en',
          text: 'Fuego Draco Hands'
        }
      ],
      name: 'Fuego Draco Hands',
      image: 'image.png',
      rarity: 'legendary',
      metrics: {
        bodies: 3,
        meshes: 3,
        entities: 1,
        textures: 2,
        materials: 1,
        triangles: 1516
      },
      thumbnail: 'thumbnail.png',
      description: '',
      collectionAddress: '0xc64642b53a67e98c6d9c42045e8356630e3accca'
    },
    versions: {
      assets: {
        windows: { version: '', buildDate: '' },
        mac: { version: '', buildDate: '' }
      }
    },
    ...overrideProperties
  }
}
