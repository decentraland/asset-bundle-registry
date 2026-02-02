import { Registry } from '../../src/types'
import { createRegistryEntity, createRequestMaker, getIdentity, Identity } from '../utils'
import { test } from '../components'

test('GET /worlds/:worldName/manifest', async ({ components }) => {
  let identity: Identity
  let fetchLocally: ReturnType<typeof createRequestMaker>['makeLocalRequest']
  const registriesToCleanUp: string[] = []
  const spawnCoordinatesToCleanUp: string[] = []

  beforeAll(async () => {
    const { makeLocalRequest } = createRequestMaker(components)
    fetchLocally = makeLocalRequest
    identity = await getIdentity()
  })

  afterEach(async () => {
    if (registriesToCleanUp.length > 0) {
      await components.db.deleteRegistries(registriesToCleanUp)
      registriesToCleanUp.length = 0
    }

    if (spawnCoordinatesToCleanUp.length > 0) {
      await components.extendedDb.deleteSpawnCoordinates(spawnCoordinatesToCleanUp)
      spawnCoordinatesToCleanUp.length = 0
    }
  })

  afterAll(async () => {
    await components.extendedDb.close()
  })

  const createWorldRegistry = async (
    worldName: string,
    pointers: string[],
    overrides: Partial<Registry.DbEntity> = {}
  ): Promise<Registry.DbEntity> => {
    const registry = createRegistryEntity(
      identity.realAccount.address,
      Registry.Status.COMPLETE,
      Registry.SimplifiedStatus.COMPLETE,
      {
        type: 'world',
        pointers,
        metadata: {
          worldConfiguration: {
            name: worldName
          }
        },
        ...overrides
      }
    )
    await components.extendedDb.insertRegistry(registry)
    registriesToCleanUp.push(registry.id)
    spawnCoordinatesToCleanUp.push(worldName)
    return registry
  }

  describe('when the world name is valid', () => {
    describe('and the world has deployed scenes with a spawn coordinate', () => {
      const worldName = 'test-world.dcl.eth'

      beforeEach(async () => {
        await createWorldRegistry(worldName, ['0,0', '1,0', '0,1'], { id: 'world-manifest-entity-1', timestamp: 1000 })
        await components.extendedDb.insertSpawnCoordinate(worldName, 1, 0, true, 1000)
      })

      it('should respond with a 200 status and the manifest containing occupied parcels and spawn coordinate', async () => {
        const response = await fetchLocally('GET', `/worlds/${worldName}/manifest`, undefined, undefined)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.occupied).toEqual(expect.arrayContaining(['0,0', '1,0', '0,1']))
        expect(body.spawn_coordinate).toEqual({ x: 1, y: 0 })
        expect(body.total).toBe(3)
      })
    })

    describe('and the world has no deployed scenes', () => {
      const worldName = 'empty-world.dcl.eth'

      it('should respond with a 200 status and an empty manifest with default spawn coordinate', async () => {
        spawnCoordinatesToCleanUp.push(worldName)
        const response = await fetchLocally('GET', `/worlds/${worldName}/manifest`, undefined, undefined)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.occupied).toEqual([])
        expect(body.spawn_coordinate).toEqual({ x: 0, y: 0 })
        expect(body.total).toBe(0)
      })
    })

    describe('and the world name is in name.eth format', () => {
      const worldName = 'simple-world.eth'

      beforeEach(async () => {
        await createWorldRegistry(worldName, ['5,5'], { id: 'world-manifest-entity-2', timestamp: 1000 })
        await components.extendedDb.insertSpawnCoordinate(worldName, 5, 5, false, 1000)
      })

      it('should respond with a 200 status and the manifest', async () => {
        const response = await fetchLocally('GET', `/worlds/${worldName}/manifest`, undefined, undefined)

        expect(response.status).toBe(200)
        const body = await response.json()
        expect(body.occupied).toEqual(['5,5'])
        expect(body.spawn_coordinate).toEqual({ x: 5, y: 5 })
        expect(body.total).toBe(1)
      })
    })
  })

  describe('when the world name is invalid', () => {
    describe('and the world name does not have a valid format', () => {
      it('should respond with a 400 status and an error message', async () => {
        const response = await fetchLocally('GET', '/worlds/invalid-world/manifest', undefined, undefined)

        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })
    })

    describe('and the world name is empty', () => {
      it('should respond with a 400 status and an error message', async () => {
        const response = await fetchLocally('GET', '/worlds/.eth/manifest', undefined, undefined)

        expect(response.status).toBe(400)
        const body = await response.json()
        expect(body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })
    })
  })
})
