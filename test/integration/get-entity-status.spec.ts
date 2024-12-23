import { getAuthHeaders, getIdentity, Identity } from "../utils"
import { test } from '../components'
import { Authenticator } from "@dcl/crypto"
import { Registry } from "../../src/types"
import { EntityType } from "@dcl/schemas"

test('GET /entities/status/:id', function ({ components, stubComponents }) {
    const endpointPath = '/entities/status/'
    let identity: Identity

    function makeRequest(method: string, path: string, identity: Identity, metadata: Record<string, any> = {}) {
        const { localFetch } = components
    
        return localFetch.fetch(path, {
          method: method,
          headers: {
            ...getAuthHeaders(method, path, metadata, (payload) =>
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
        })
    }

    function createRegistry(ownerAddress: string, status: Registry.Status, bundlesStatus: Registry.SimplifiedStatus): Registry.DbEntity {
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
            pointers: [],
            timestamp: 0,
            content: [],
            type: EntityType.SCENE
        }
    }
    
    beforeEach(async function () {
        identity = await getIdentity()
    })

    it('should return the entity status', async function () {
        const entityId = 'bafkreig6666666666666666666666666666666666666666666666666666666666666666'
        const completeUrl = `${endpointPath}${entityId}`
        const ownerAddress = identity.realAccount.address
        const registry = createRegistry(ownerAddress, Registry.Status.COMPLETE, Registry.SimplifiedStatus.COMPLETE)
        stubComponents.db.getRegistryById.resolves(registry)

        const response = await makeRequest('GET', completeUrl, identity)

        const parsedResponse = await response.json()
        expect(response.status).toBe(200)
        expect(parsedResponse).toMatchObject({
            assetBundles: { mac: 'complete', windows: 'complete' },
            catalyst: 'complete',
            complete: true,
            lods: { mac: 'complete', windows: 'complete' }
        })
    })  

    it('should return 404 when entity is not found', async function () {
        const entityId = 'bafkreig6666666666666666666666666666666666666666666666666666666666666666'
        const completeUrl = `${endpointPath}${entityId}`
        stubComponents.db.getRegistryById.resolves(null)

        const response = await makeRequest('GET', completeUrl, identity)

        const parsedResponse = await response.json()
        expect(response.status).toBe(404)
        expect(parsedResponse).toMatchObject({
            ok: false,
            message: 'No active entity found for the provided id'
        })
    })

    it('should return 404 when entity is owned by different user', async function () {
        const entityId = 'bafkreig6666666666666666666666666666666666666666666666666666666666666666'
        const completeUrl = `${endpointPath}${entityId}`
        const differentOwner = '0x1234567890123456789012345678901234567890'
        const registry = createRegistry(differentOwner, Registry.Status.COMPLETE, Registry.SimplifiedStatus.COMPLETE)
        stubComponents.db.getRegistryById.resolves(registry)

        const response = await makeRequest('GET', completeUrl, identity)

        const parsedResponse = await response.json()
        expect(response.status).toBe(404)
        expect(parsedResponse).toMatchObject({
            ok: false,
            message: 'No active entity found for the provided id'
        })
    })

    it('should return pending status when bundles are pending', async function () {
        const entityId = 'bafkreig6666666666666666666666666666666666666666666666666666666666666666'
        const completeUrl = `${endpointPath}${entityId}`
        const ownerAddress = identity.realAccount.address
        const registry = createRegistry(ownerAddress, Registry.Status.PENDING, Registry.SimplifiedStatus.PENDING)
        stubComponents.db.getRegistryById.resolves(registry)

        const response = await makeRequest('GET', completeUrl, identity)

        const parsedResponse = await response.json()
        expect(response.status).toBe(200)
        expect(parsedResponse).toMatchObject({
            assetBundles: { mac: 'pending', windows: 'pending' },
            catalyst: 'complete',
            complete: false,
            lods: { mac: 'pending', windows: 'pending' }
        })
    })

    it('should return mixed status when some bundles failed', async function () {
        const entityId = 'bafkreig6666666666666666666666666666666666666666666666666666666666666666'
        const completeUrl = `${endpointPath}${entityId}`
        const ownerAddress = identity.realAccount.address
        const registry = createRegistry(ownerAddress, Registry.Status.FAILED, Registry.SimplifiedStatus.FAILED)
        registry.bundles.assets.windows = Registry.SimplifiedStatus.COMPLETE
        registry.bundles.lods.mac = Registry.SimplifiedStatus.COMPLETE
        stubComponents.db.getRegistryById.resolves(registry)

        const response = await makeRequest('GET', completeUrl, identity)

        const parsedResponse = await response.json()
        expect(response.status).toBe(200)
        expect(parsedResponse).toMatchObject({
            assetBundles: { mac: 'failed', windows: 'complete' },
            catalyst: 'complete',
            complete: false,
            lods: { mac: 'complete', windows: 'failed' }
        })
    })
})

test('GET /entities/status', function ({ components, stubComponents }) {
    const endpointPath = '/entities/status'
    let identity: Identity

    function makeRequest(method: string, path: string, identity: Identity, metadata: Record<string, any> = {}) {
        const { localFetch } = components
    
        return localFetch.fetch(path, {
          method: method,
          headers: {
            ...getAuthHeaders(method, path, metadata, (payload) =>
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
        })
    }

    function createRegistry(ownerAddress: string, status: Registry.Status, bundlesStatus: Registry.SimplifiedStatus): Registry.DbEntity {
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
            pointers: [],
            timestamp: 0,
            content: [],
            type: EntityType.SCENE
        }
    }
    
    beforeEach(async function () {
        identity = await getIdentity()
    })

    it('should return all entities status for the user', async function () {
        const ownerAddress = identity.realAccount.address
        const registries = [
            createRegistry(ownerAddress, Registry.Status.COMPLETE, Registry.SimplifiedStatus.COMPLETE),
            createRegistry(ownerAddress, Registry.Status.PENDING, Registry.SimplifiedStatus.PENDING)
        ]
        stubComponents.db.getSortedRegistriesByOwner.resolves(registries)

        const response = await makeRequest('GET', endpointPath, identity)

        const parsedResponse = await response.json()
        expect(response.status).toBe(200)
        expect(parsedResponse).toHaveLength(2)
        expect(parsedResponse[0]).toMatchObject({
            assetBundles: { mac: 'complete', windows: 'complete' },
            catalyst: 'complete',
            complete: true,
            lods: { mac: 'complete', windows: 'complete' }
        })
        expect(parsedResponse[1]).toMatchObject({
            assetBundles: { mac: 'pending', windows: 'pending' },
            catalyst: 'complete',
            complete: false,
            lods: { mac: 'pending', windows: 'pending' }
        })
    })

    it('should filter out entities owned by different users', async function () {
        const ownerAddress = identity.realAccount.address
        const differentOwner = '0x1234567890123456789012345678901234567890'
        const registries = [
            createRegistry(ownerAddress, Registry.Status.COMPLETE, Registry.SimplifiedStatus.COMPLETE),
            createRegistry(differentOwner, Registry.Status.COMPLETE, Registry.SimplifiedStatus.COMPLETE)
        ]
        stubComponents.db.getSortedRegistriesByOwner.resolves(registries)

        const response = await makeRequest('GET', endpointPath, identity)

        const parsedResponse = await response.json()
        expect(response.status).toBe(200)
        expect(parsedResponse).toHaveLength(1)
        expect(parsedResponse[0]).toMatchObject({
            assetBundles: { mac: 'complete', windows: 'complete' },
            catalyst: 'complete',
            complete: true,
            lods: { mac: 'complete', windows: 'complete' }
        })
    })

    it('should handle mixed status entities', async function () {
        const ownerAddress = identity.realAccount.address
        const registry = createRegistry(ownerAddress, Registry.Status.FAILED, Registry.SimplifiedStatus.FAILED)
        registry.bundles.assets.windows = Registry.SimplifiedStatus.COMPLETE
        registry.bundles.lods.mac = Registry.SimplifiedStatus.COMPLETE
        stubComponents.db.getSortedRegistriesByOwner.resolves([registry])

        const response = await makeRequest('GET', endpointPath, identity)

        const parsedResponse = await response.json()
        expect(response.status).toBe(200)
        expect(parsedResponse).toHaveLength(1)
        expect(parsedResponse[0]).toMatchObject({
            assetBundles: { mac: 'failed', windows: 'complete' },
            catalyst: 'complete',
            complete: false,
            lods: { mac: 'complete', windows: 'failed' }
        })
    })
})