import { Registry } from '../../src/types'
import { createRegistryEntity, createRequestMaker, getIdentity, Identity } from '../utils'
import { test } from '../components'

test('POST /entities endpoints', async function ({ components }) {
  let identity: Identity
  let fetchLocally: any
  const registriesToCleanUp: Record<string, string[]> = {
    historical: [],
    current: []
  }

  const endpoints = [
    {
      path: '/entities/active',
      parseResponse: (response: Registry.DbEntity[]) =>
        response.map((entity: Registry.DbEntity) => ({
          ...entity,
          deployer: entity.deployer.toLocaleLowerCase(),
          timestamp: entity.timestamp.toString(),
          versions: entity.versions
        }))
    },
    {
      path: '/entities/versions',
      parseResponse: (response: Registry.DbEntity[]) =>
        response.map((entity: Registry.DbEntity) => ({
          status: entity.status,
          bundles: entity.bundles,
          versions: entity.versions,
          pointers: entity.pointers
        }))
    }
  ]

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

  endpoints.forEach(({ path, parseResponse }) => {
    describe(`POST ${path}`, () => {
      describe('when the request is valid', () => {
        describe('and a single entity exists', () => {
          describe('and the entity has COMPLETE status', () => {
            let registry: Registry.DbEntity

            beforeEach(async () => {
              registry = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.COMPLETE,
                Registry.SimplifiedStatus.COMPLETE
              )
              await createRegistryOnDatabase(registry)
            })

            it('should return the entity with correct properties', async () => {
              const response = await fetchLocally('POST', path, undefined, {
                pointers: [registry.pointers[0]]
              })
              const parsedResponse = await response.json()

              expect(parsedResponse).toEqual(parseResponse([registry]))
            })
          })

          describe('and the entity has FALLBACK status', () => {
            let registry: Registry.DbEntity

            beforeEach(async () => {
              registry = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.FALLBACK,
                Registry.SimplifiedStatus.COMPLETE
              )
              await createRegistryOnDatabase(registry)
            })

            it('should return the entity with correct properties', async () => {
              const response = await fetchLocally('POST', path, undefined, {
                pointers: [registry.pointers[0]]
              })
              const parsedResponse = await response.json()

              expect(parsedResponse).toEqual(parseResponse([registry]))
            })
          })

          describe('and the entity has FAILED status', () => {
            let registry: Registry.DbEntity

            beforeEach(async () => {
              registry = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.FAILED,
                Registry.SimplifiedStatus.FAILED
              )
              await createRegistryOnDatabase(registry)
            })

            it('should return an empty array', async () => {
              const response = await fetchLocally('POST', path, undefined, {
                pointers: [registry.pointers[0]]
              })
              const parsedResponse = await response.json()

              expect(parsedResponse).toEqual([])
            })
          })

          describe('and the entity has PENDING status', () => {
            let registry: Registry.DbEntity

            beforeEach(async () => {
              registry = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.PENDING,
                Registry.SimplifiedStatus.PENDING
              )
              await createRegistryOnDatabase(registry)
            })

            it('should return an empty array', async () => {
              const response = await fetchLocally('POST', path, undefined, {
                pointers: [registry.pointers[0]]
              })
              const parsedResponse = await response.json()

              expect(parsedResponse).toEqual([])
            })
          })
        })

        describe('and multiple pointers point to the same entity', () => {
          let registry: Registry.DbEntity

          beforeEach(async () => {
            registry = createRegistryEntity(
              identity.realAccount.address,
              Registry.Status.COMPLETE,
              Registry.SimplifiedStatus.COMPLETE,
              { id: 'registryA', pointers: ['1000,1000', '1001,1001'] }
            )
            await createRegistryOnDatabase(registry)
          })

          it('should return a single entity', async () => {
            const response = await fetchLocally('POST', path, undefined, {
              pointers: [registry.pointers[0], registry.pointers[1]]
            })
            const parsedResponse = await response.json()

            expect(parsedResponse).toEqual(parseResponse([registry]))
          })
        })

        describe('and multiple pointers point to different entities', () => {
          describe('and all entities have valid statuses (COMPLETE/FALLBACK)', () => {
            let registryA: Registry.DbEntity
            let registryB: Registry.DbEntity

            beforeEach(async () => {
              registryA = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.COMPLETE,
                Registry.SimplifiedStatus.COMPLETE
              )
              registryB = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.FALLBACK,
                Registry.SimplifiedStatus.COMPLETE,
                { id: 'registryB', pointers: ['1001,1001'] }
              )
              await createRegistryOnDatabase(registryA)
              await createRegistryOnDatabase(registryB)
            })

            it('should return multiple entities', async () => {
              const response = await fetchLocally('POST', path, undefined, {
                pointers: [registryA.pointers[0], registryB.pointers[0]]
              })
              const parsedResponse = await response.json()

              expect(parsedResponse).toEqual(parseResponse([registryA, registryB]))
            })
          })

          describe('and some entities have invalid statuses (FAILED/PENDING)', () => {
            let registryA: Registry.DbEntity
            let registryB: Registry.DbEntity

            beforeEach(async () => {
              registryA = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.COMPLETE,
                Registry.SimplifiedStatus.COMPLETE
              )
              registryB = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.FAILED,
                Registry.SimplifiedStatus.FAILED,
                { id: 'registryB', pointers: ['1001,1001'] }
              )
              await createRegistryOnDatabase(registryA)
              await createRegistryOnDatabase(registryB)
            })

            it('should return only entities with valid statuses', async () => {
              const response = await fetchLocally('POST', path, undefined, {
                pointers: [registryA.pointers[0], registryB.pointers[0]]
              })
              const parsedResponse = await response.json()

              expect(parsedResponse).toEqual(parseResponse([registryA]))
            })
          })
        })

        describe('and some pointers exist and others do not', () => {
          let registry: Registry.DbEntity

          beforeEach(async () => {
            registry = createRegistryEntity(
              identity.realAccount.address,
              Registry.Status.COMPLETE,
              Registry.SimplifiedStatus.COMPLETE
            )
            await createRegistryOnDatabase(registry)
          })

          it('should return only the existing entities', async () => {
            const response = await fetchLocally('POST', path, undefined, {
              pointers: [registry.pointers[0], 'non-existent-pointer']
            })
            const parsedResponse = await response.json()

            expect(parsedResponse).toEqual(parseResponse([registry]))
          })
        })

        describe('and duplicate pointers are provided', () => {
          let registry: Registry.DbEntity

          beforeEach(async () => {
            registry = createRegistryEntity(
              identity.realAccount.address,
              Registry.Status.COMPLETE,
              Registry.SimplifiedStatus.COMPLETE
            )
            await createRegistryOnDatabase(registry)
          })

          it('should return the entity without duplicates', async () => {
            const response = await fetchLocally('POST', path, undefined, {
              pointers: [registry.pointers[0], registry.pointers[0]]
            })
            const parsedResponse = await response.json()

            expect(parsedResponse).toEqual(parseResponse([registry]))
          })
        })

        describe('and querying with world coordinates using world_name parameter', () => {
          describe('and the entity has world coordinates', () => {
            let registry: Registry.DbEntity

            beforeEach(async () => {
              registry = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.COMPLETE,
                Registry.SimplifiedStatus.COMPLETE,
                {
                  id: 'world-scene-entity-1',
                  type: 'world',
                  pointers: ['0,0', '1,0'],
                  metadata: {
                    worldConfiguration: {
                      name: 'testworld.dcl.eth'
                    }
                  }
                }
              )
              await createRegistryOnDatabase(registry)
            })

            it('should return the entity when querying with coordinates and world_name', async () => {
              const response = await fetchLocally(
                'POST',
                path,
                undefined,
                {
                  pointers: ['0,0']
                },
                {},
                { world_name: 'testworld.dcl.eth' }
              )
              const parsedResponse = await response.json()

              expect(parsedResponse).toEqual(parseResponse([registry]))
            })
          })

          describe('and multiple entities exist in the same world', () => {
            let registryA: Registry.DbEntity
            let registryB: Registry.DbEntity

            beforeEach(async () => {
              registryA = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.COMPLETE,
                Registry.SimplifiedStatus.COMPLETE,
                {
                  id: 'world-scene-entity-2a',
                  type: 'world',
                  pointers: ['0,0'],
                  metadata: {
                    worldConfiguration: {
                      name: 'anotherworld.dcl.eth'
                    }
                  }
                }
              )
              registryB = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.COMPLETE,
                Registry.SimplifiedStatus.COMPLETE,
                {
                  id: 'world-scene-entity-2b',
                  type: 'world',
                  pointers: ['1,0'],
                  metadata: {
                    worldConfiguration: {
                      name: 'anotherworld.dcl.eth'
                    }
                  }
                }
              )
              await createRegistryOnDatabase(registryA)
              await createRegistryOnDatabase(registryB)
            })

            it('should return all entities in the world when querying with coordinates and world_name', async () => {
              const response = await fetchLocally(
                'POST',
                path,
                undefined,
                {
                  pointers: ['0,0', '1,0']
                },
                {},
                { world_name: 'anotherworld.dcl.eth' }
              )
              const parsedResponse = await response.json()

              expect(parsedResponse).toEqual(parseResponse([registryA, registryB]))
            })
          })

          describe('and the entity has a legacy world pointer (not world scene pointer)', () => {
            let registry: Registry.DbEntity

            beforeEach(async () => {
              registry = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.COMPLETE,
                Registry.SimplifiedStatus.COMPLETE,
                { id: 'legacy-world-entity', pointers: ['legacyworld.dcl.eth'] }
              )
              await createRegistryOnDatabase(registry)
            })

            it('should return the entity when querying with the same legacy world pointer', async () => {
              const response = await fetchLocally('POST', path, undefined, {
                pointers: ['legacyworld.dcl.eth']
              })
              const parsedResponse = await response.json()

              expect(parsedResponse).toEqual(parseResponse([registry]))
            })
          })

          describe('and mixing world coordinates with genesis coordinates', () => {
            let worldRegistry: Registry.DbEntity
            let genesisRegistry: Registry.DbEntity

            beforeEach(async () => {
              worldRegistry = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.COMPLETE,
                Registry.SimplifiedStatus.COMPLETE,
                {
                  id: 'mixed-world-entity',
                  type: 'world',
                  pointers: ['0,0'],
                  metadata: {
                    worldConfiguration: {
                      name: 'mixedworld.dcl.eth'
                    }
                  }
                }
              )
              genesisRegistry = createRegistryEntity(
                identity.realAccount.address,
                Registry.Status.COMPLETE,
                Registry.SimplifiedStatus.COMPLETE,
                { id: 'mixed-genesis-entity', pointers: ['2000,2000'] }
              )
              await createRegistryOnDatabase(worldRegistry)
              await createRegistryOnDatabase(genesisRegistry)
            })

            it('should return both entities when querying with world coordinates (with world_name) and genesis coordinates', async () => {
              // Query for world entity with world_name parameter
              const worldResponse = await fetchLocally(
                'POST',
                path,
                undefined,
                {
                  pointers: ['0,0']
                },
                {},
                { world_name: 'mixedworld.dcl.eth' }
              )
              const worldParsedResponse = await worldResponse.json()

              // Query for genesis entity (no world_name parameter)
              const genesisResponse = await fetchLocally('POST', path, undefined, {
                pointers: ['2000,2000']
              })
              const genesisParsedResponse = await genesisResponse.json()

              // Combine results
              const allResults = [...worldParsedResponse, ...genesisParsedResponse]

              expect(allResults).toEqual(parseResponse([worldRegistry, genesisRegistry]))
            })
          })

          describe('and the world has no entities', () => {
            it('should return an empty array', async () => {
              const response = await fetchLocally(
                'POST',
                path,
                undefined,
                {
                  pointers: ['0,0']
                },
                {},
                { world_name: 'nonexistentworld.dcl.eth' }
              )
              const parsedResponse = await response.json()

              expect(parsedResponse).toEqual([])
            })
          })
        })

        describe('and querying with world coordinates directly', () => {
          let registry: Registry.DbEntity

          beforeEach(async () => {
            registry = createRegistryEntity(
              identity.realAccount.address,
              Registry.Status.COMPLETE,
              Registry.SimplifiedStatus.COMPLETE,
              {
                id: 'direct-world-scene-entity',
                type: 'world',
                pointers: ['5,5'],
                metadata: {
                  worldConfiguration: {
                    name: 'directworld.dcl.eth'
                  }
                }
              }
            )
            await createRegistryOnDatabase(registry)
          })

          describe('and the query uses the exact coordinate with world_name', () => {
            let response: Response
            let parsedResponse: any

            beforeEach(async () => {
              response = await fetchLocally(
                'POST',
                path,
                undefined,
                {
                  pointers: ['5,5']
                },
                {},
                { world_name: 'directworld.dcl.eth' }
              )
              parsedResponse = await response.json()
            })

            it('should return the entity', async () => {
              expect(parsedResponse).toEqual(parseResponse([registry]))
            })
          })

          describe('and the query uses a different coordinate in the same world', () => {
            let response: Response
            let parsedResponse: any

            beforeEach(async () => {
              response = await fetchLocally(
                'POST',
                path,
                undefined,
                {
                  pointers: ['0,0']
                },
                {},
                { world_name: 'directworld.dcl.eth' }
              )
              parsedResponse = await response.json()
            })

            it('should return an empty array', async () => {
              expect(parsedResponse).toEqual([])
            })
          })
        })
      })

      describe('when no entities are found', () => {
        it('should return an empty array', async () => {
          const response = await fetchLocally('POST', path, undefined, {
            pointers: ['1000,1000']
          })
          const parsedResponse = await response.json()

          expect(parsedResponse).toEqual([])
        })
      })

      describe('when the request is invalid', () => {
        describe('and no pointers are provided', () => {
          it('should return 400 status with error message', async () => {
            const response = await fetchLocally('POST', path, undefined, {
              pointers: []
            })
            expect(response.status).toBe(400)
            const parsedResponse = await response.json()
            expect(parsedResponse).toEqual({
              ok: false,
              message: 'No pointers provided'
            })
          })
        })

        describe('and pointers is null', () => {
          it('should return 400 status with error message', async () => {
            const response = await fetchLocally('POST', path, undefined, {
              pointers: null
            })
            expect(response.status).toBe(400)
            const parsedResponse = await response.json()
            expect(parsedResponse).toEqual({
              ok: false,
              message: 'No pointers provided'
            })
          })
        })
      })
    })
  })
})
