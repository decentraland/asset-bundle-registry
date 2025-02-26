import { Registry } from '../../src/types'
import { createRegistryEntity, createRequestMaker, getIdentity, Identity } from '../utils'
import { test } from '../components'

test('POST /entities/active', async function ({ components }) {
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

  function parseResponse(response: Registry.DbEntity[]) {
    return response.map((entity: Registry.DbEntity) => ({
      ...entity,
      deployer: entity.deployer.toLocaleLowerCase(),
      timestamp: entity.timestamp.toString()
    }))
  }

  it('should return active entity correctly', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )

    await createRegistryOnDatabase(registry)

    const response = await fetchLocally('POST', '/entities/active', undefined, { pointers: [registry.pointers[0]] })
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject(parseResponse([registry]))
  })

  it('should return 200 ok and empty array when entities are not found for given pointers', async function () {
    const response = await fetchLocally('POST', '/entities/active', undefined, { pointers: ['1000,1000'] })
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject([])
  })

  it('should return single entity when multiple pointers are provided but are related to the same entity', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE,
      { id: 'registryA', pointers: ['1000,1000', '1001,1001'] }
    )

    await createRegistryOnDatabase(registry)

    const response = await fetchLocally('POST', '/entities/active', undefined, {
      pointers: [registry.pointers[0], registry.pointers[1]]
    })
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject(parseResponse([registry]))
  })

  it('should return multiple entities when multiple pointers are provided and are related to different entities', async function () {
    const registryA = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )

    const registryB = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE,
      { id: 'registryB', pointers: ['1001,1001'] }
    )

    await createRegistryOnDatabase(registryA)
    await createRegistryOnDatabase(registryB)

    const response = await fetchLocally('POST', '/entities/active', undefined, {
      pointers: [registryA.pointers[0], registryB.pointers[0]]
    })
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject(parseResponse([registryA, registryB]))
  })

  it('should return most updated entity when multiple entities are found for the same pointer', async function () {
    const registryA = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.FALLBACK,
      Registry.SimplifiedStatus.COMPLETE,
      { timestamp: 1000 }
    )

    const registryB = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE,
      { id: 'registryB', pointers: ['1000,1000'], timestamp: 2000 }
    )

    await createRegistryOnDatabase(registryA)
    await createRegistryOnDatabase(registryB)

    const response = await fetchLocally('POST', '/entities/active', undefined, {
      pointers: [registryA.pointers[0], registryB.pointers[0]]
    })
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject(parseResponse([registryB]))
  })

  it('should return complete entity when a newer entity is found but the status is FAILED', async function () {
    const registryA = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )

    const registryB = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.FAILED,
      Registry.SimplifiedStatus.COMPLETE,
      { id: 'registryB', pointers: ['1000,1000'], timestamp: 2000 }
    )

    await createRegistryOnDatabase(registryA)
    await createRegistryOnDatabase(registryB)

    const response = await fetchLocally('POST', '/entities/active', undefined, {
      pointers: [registryA.pointers[0], registryB.pointers[0]]
    })
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject(parseResponse([registryA]))
  })

  it('should return 400 when no pointers are provided', async function () {
    const response = await fetchLocally('POST', '/entities/active', undefined, { pointers: [] })
    expect(response.status).toBe(400)
    const parsedResponse = await response.json()
    expect(parsedResponse).toMatchObject({
      ok: false,
      message: 'No pointers provided'
    })
  })

  it('should return 400 when pointers is null', async function () {
    const response = await fetchLocally('POST', '/entities/active', undefined, { pointers: null })
    expect(response.status).toBe(400)
    const parsedResponse = await response.json()
    expect(parsedResponse).toMatchObject({
      ok: false,
      message: 'No pointers provided'
    })
  })

  it('should handle mix of existing and non-existing pointers', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )
    await createRegistryOnDatabase(registry)

    const response = await fetchLocally('POST', '/entities/active', undefined, {
      pointers: [registry.pointers[0], 'non-existent-pointer']
    })
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject(parseResponse([registry]))
  })

  it('should handle duplicate pointers in request', async function () {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE
    )
    await createRegistryOnDatabase(registry)

    const response = await fetchLocally('POST', '/entities/active', undefined, {
      pointers: [registry.pointers[0], registry.pointers[0]]
    })
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject(parseResponse([registry]))
  })

  it('should return most recent COMPLETE entity when multiple status exist', async function () {
    const registryA = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE,
      { timestamp: 1000 }
    )

    const registryB = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.FAILED,
      Registry.SimplifiedStatus.FAILED,
      { id: 'registryB', pointers: ['1000,1000'], timestamp: 2000 }
    )

    const registryC = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE,
      { id: 'registryC', pointers: ['1000,1000'], timestamp: 3000 }
    )

    await createRegistryOnDatabase(registryA)
    await createRegistryOnDatabase(registryB)
    await createRegistryOnDatabase(registryC)

    const response = await fetchLocally('POST', '/entities/active', undefined, {
      pointers: [registryA.pointers[0]]
    })
    const parsedResponse = await response.json()

    expect(parsedResponse).toMatchObject(parseResponse([registryC]))
  })
})
