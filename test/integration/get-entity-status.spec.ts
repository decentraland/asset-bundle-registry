import { createRegistryEntity, createRequestMaker, getIdentity, Identity } from '../utils'
import { test } from '../components'
import { Registry } from '../../src/types'

test('GET /entities/status/:id', function ({ components }) {
  let identity: Identity
  let fetchLocally: any
  const registriesToCleanUp: Record<string, string[]> = {
    historical: [],
    current: []
  }

  beforeAll(async function () {
    const { makeLocalRequest } = createRequestMaker(components)
    fetchLocally = makeLocalRequest
  })

  beforeEach(async function () {
    identity = await getIdentity()
  })

  afterEach(async function () {
    if (registriesToCleanUp.current.length > 0) {
      await components.db.deleteRegistries(registriesToCleanUp.current)
      registriesToCleanUp.current = []
    }

    if (registriesToCleanUp.historical.length > 0) {
      await components.extendedDb.deleteHistoricalRegistries(registriesToCleanUp.historical)
      registriesToCleanUp.historical = []
    }
  })

  afterAll(async function () {
    await components.extendedDb.close()
  })

  async function createRegistryOnDatabase(registry: Registry.DbEntity, isObsolete = false) {
    if (isObsolete) {
      await components.extendedDb.insertHistoricalRegistry(registry)
      registriesToCleanUp.historical.push(registry.id)
    } else {
      await components.extendedDb.insertRegistry(registry)
      registriesToCleanUp.current.push(registry.id)
    }
  }

  it('should return completed entity status correctly', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )
    await createRegistryOnDatabase(registry)

    const response = await fetchLocally('GET', `/entities/status/${registry.id}`, identity)
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject({
      entityId: registry.id,
      catalyst: 'complete',
      complete: true,
      assetBundles: { mac: 'complete', windows: 'complete' },
      lods: { mac: 'complete', windows: 'complete' }
    })
  })

  it('should return fallback entity status correctly', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.FALLBACK,
      Registry.SimplifiedStatus.COMPLETE
    )
    await createRegistryOnDatabase(registry)

    const response = await fetchLocally('GET', `/entities/status/${registry.id}`, identity)
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject({
      entityId: registry.id,
      catalyst: 'complete',
      complete: true,
      assetBundles: { mac: 'complete', windows: 'complete' },
      lods: { mac: 'complete', windows: 'complete' }
    })
  })

  it('should return obsolete entity status correctly', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.OBSOLETE,
      Registry.SimplifiedStatus.COMPLETE
    )
    await createRegistryOnDatabase(registry, true)

    const response = await fetchLocally('GET', `/entities/status/${registry.id}`, identity)
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject({
      entityId: registry.id,
      catalyst: 'complete',
      complete: true,
      assetBundles: { mac: 'complete', windows: 'complete' },
      lods: { mac: 'complete', windows: 'complete' }
    })
  })

  it('should return failed entity status correctly', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.FAILED,
      Registry.SimplifiedStatus.FAILED
    )
    await createRegistryOnDatabase(registry, true)

    const response = await fetchLocally('GET', `/entities/status/${registry.id}`, identity)
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject({
      entityId: registry.id,
      catalyst: 'complete',
      complete: false,
      assetBundles: { mac: 'failed', windows: 'failed' },
      lods: { mac: 'failed', windows: 'failed' }
    })
  })

  it('should return obsolete entity from historical records correctly', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.OBSOLETE,
      Registry.SimplifiedStatus.COMPLETE
    )
    await createRegistryOnDatabase(registry, true)

    const response = await fetchLocally('GET', `/entities/status/${registry.id}`, identity)
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject({
      entityId: registry.id,
      catalyst: 'complete',
      complete: true,
      assetBundles: { mac: 'complete', windows: 'complete' },
      lods: { mac: 'complete', windows: 'complete' }
    })
  })

  it('should return entity status correctly when a pointer is provided', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )
    await createRegistryOnDatabase(registry)

    const response = await fetchLocally('GET', `/entities/status/${registry.pointers[0]}`, identity)
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject({
      entityId: registry.id,
      catalyst: 'complete',
      complete: true,
      assetBundles: { mac: 'complete', windows: 'complete' },
      lods: { mac: 'complete', windows: 'complete' }
    })
  })

  it('should return entity status correctly when querying with world coordinates and world_name', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE,
      {
        id: 'world-scene-status-entity',
        type: 'world',
        pointers: ['0,0'],
        metadata: {
          worldConfiguration: {
            name: 'statusworld.dcl.eth'
          }
        }
      }
    )
    await createRegistryOnDatabase(registry)

    const response = await fetchLocally(
      'GET',
      `/entities/status/${encodeURIComponent('0,0')}`,
      identity,
      undefined,
      {},
      { world_name: 'statusworld.dcl.eth' }
    )
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject({
      entityId: registry.id,
      catalyst: 'complete',
      complete: true,
      assetBundles: { mac: 'complete', windows: 'complete' }
    })
    // Worlds don't support LODs
    expect(parsedResponse.lods).toBeUndefined()
  })

  it('should return the most recent entity status when querying with world coordinates and world_name', async function () {
    const olderRegistry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE,
      {
        id: 'older-world-scene-entity',
        type: 'world',
        pointers: ['0,0'],
        timestamp: 1000,
        metadata: {
          worldConfiguration: {
            name: 'legacystatusworld.dcl.eth'
          }
        }
      }
    )
    const newerRegistry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE,
      {
        id: 'newer-world-scene-entity',
        type: 'world',
        pointers: ['1,0'],
        timestamp: 2000,
        metadata: {
          worldConfiguration: {
            name: 'legacystatusworld.dcl.eth'
          }
        }
      }
    )
    await createRegistryOnDatabase(olderRegistry)
    await createRegistryOnDatabase(newerRegistry)

    const response = await fetchLocally(
      'GET',
      `/entities/status/${encodeURIComponent('1,0')}`,
      identity,
      undefined,
      {},
      { world_name: 'legacystatusworld.dcl.eth' }
    )
    const parsedResponse = await response.json()

    // Should return the most recent entity (descSort is true in the handler)
    expect(parsedResponse).toMatchObject({
      entityId: newerRegistry.id,
      catalyst: 'complete',
      complete: true,
      assetBundles: { mac: 'complete', windows: 'complete' }
    })
    // Worlds don't support LODs
    expect(parsedResponse.lods).toBeUndefined()
  })

  it('should return 404 when no entity is found', async function () {
    const response = await fetchLocally('GET', `/entities/status/nonexistentId`, identity)
    const parsedResponse = await response.json()

    expect(response.status).toBe(404)
    expect(parsedResponse).toMatchObject({
      ok: false,
      message: 'No active entity found for the provided id or pointer'
    })
  })
})

test('GET /entities/status', function ({ components }) {
  let identity: Identity
  let fetchLocally: any
  const registriesToCleanUp: Record<string, string[]> = {
    historical: [],
    current: []
  }

  beforeAll(async function () {
    const { makeLocalRequest } = createRequestMaker(components)
    fetchLocally = makeLocalRequest
  })

  beforeEach(async function () {
    identity = await getIdentity()
  })

  afterEach(async function () {
    if (registriesToCleanUp.current.length > 0) {
      await components.db.deleteRegistries(registriesToCleanUp.current)
      registriesToCleanUp.current = []
    }

    if (registriesToCleanUp.historical.length > 0) {
      await components.extendedDb.deleteHistoricalRegistries(registriesToCleanUp.historical)
      registriesToCleanUp.historical = []
    }
  })

  afterAll(async function () {
    await components.extendedDb.close()
  })

  async function createRegistryOnDatabase(registry: Registry.DbEntity, isObsolete = false) {
    if (isObsolete) {
      await components.extendedDb.insertHistoricalRegistry(registry)
      registriesToCleanUp.historical.push(registry.id)
    } else {
      await components.extendedDb.insertRegistry(registry)
      registriesToCleanUp.current.push(registry.id)
    }
  }

  it('should return 400 when no auth-chain is provided', async function () {
    const response = await fetchLocally('GET', '/entities/status', undefined)
    const parsedResponse = await response.json()

    expect(response.status).toBe(400)
    expect(parsedResponse).toMatchObject({
      error: 'Invalid Auth Chain',
      message: 'This endpoint requires a signed fetch request. See ADR-44.'
    })
  })

  it('should return all entities statuses owned by user', async function () {
    const registryA = {
      ...createRegistryEntity(
        identity.realAccount.address,
        Registry.Status.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE,
        { id: 'registryA', pointers: ['1001,1002'], timestamp: 1000 }
      )
    }
    const registryB = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE,
      { timestamp: 2000 }
    )
    await createRegistryOnDatabase(registryA)
    await createRegistryOnDatabase(registryB)

    const response = await fetchLocally('GET', '/entities/status', identity)
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject([
      {
        entityId: registryB.id,
        catalyst: 'complete',
        complete: true,
        assetBundles: { mac: 'complete', windows: 'complete' },
        lods: { mac: 'complete', windows: 'complete' }
      },
      {
        entityId: registryA.id,
        catalyst: 'complete',
        complete: true,
        assetBundles: { mac: 'complete', windows: 'complete' },
        lods: { mac: 'complete', windows: 'complete' }
      }
    ])
  })

  it('should not return entity if it is not owned by user', async function () {
    const registry = createRegistryEntity(
      '0x0000000000000000000000000000000000000000',
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )
    await createRegistryOnDatabase(registry)

    const response = await fetchLocally('GET', '/entities/status', identity)
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject([])
  })

  it('should return historical entities statuses owned by user', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.OBSOLETE,
      Registry.SimplifiedStatus.COMPLETE
    )
    await createRegistryOnDatabase(registry, true)

    const response = await fetchLocally('GET', '/entities/status', identity)
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject([
      {
        entityId: registry.id,
        catalyst: 'complete',
        complete: true,
        assetBundles: { mac: 'complete', windows: 'complete' },
        lods: { mac: 'complete', windows: 'complete' }
      }
    ])
  })

  it('should return mixed of historical entities and active entities statuses owned by user', async function () {
    const registryA = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )

    const registryB = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.OBSOLETE,
      Registry.SimplifiedStatus.COMPLETE,
      { id: 'registryB', pointers: ['1001,1002'] }
    )

    await createRegistryOnDatabase(registryA)
    await createRegistryOnDatabase(registryB, true)

    const response = await fetchLocally('GET', '/entities/status', identity)
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject([
      {
        entityId: registryA.id,
        catalyst: 'complete',
        complete: true,
        assetBundles: { mac: 'complete', windows: 'complete' },
        lods: { mac: 'complete', windows: 'complete' }
      },
      {
        entityId: registryB.id,
        catalyst: 'complete',
        complete: true,
        assetBundles: { mac: 'complete', windows: 'complete' },
        lods: { mac: 'complete', windows: 'complete' }
      }
    ])
  })
})
