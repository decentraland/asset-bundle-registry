import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  ICatalystComponent,
  IDbComponent,
  IEntityPersisterComponent,
  IProfileRetrieverComponent,
  IProfilesCacheComponent,
  Sync
} from '../../../src/types'
import { createProfileRetrieverComponent } from '../../../src/logic/profile-retriever'
import { createDbMockComponent } from '../mocks/db'
import { createLogMockComponent } from '../mocks/logs'
import { createCatalystMockComponent } from '../mocks/catalyst'
import { createProfilesCacheMockComponent } from '../mocks/profiles-cache'
import { createProfileDbEntity, createProfileEntity } from '../mocks/data/profiles'
import { Entity } from '@dcl/schemas'
import { createEntityPersisterMockComponent } from '../mocks/entity-persister'

describe('profile retriever', () => {
  let mockLogs: ILoggerComponent
  let mockProfilesCache: IProfilesCacheComponent
  let mockDb: IDbComponent
  let mockCatalyst: ICatalystComponent
  let mockEntityPersister: IEntityPersisterComponent
  let component: IProfileRetrieverComponent

  beforeEach(() => {
    mockLogs = createLogMockComponent()
    mockProfilesCache = createProfilesCacheMockComponent()
    mockDb = createDbMockComponent()
    mockCatalyst = createCatalystMockComponent()
    mockEntityPersister = createEntityPersisterMockComponent()
    component = createProfileRetrieverComponent({
      logs: mockLogs,
      profilesCache: mockProfilesCache,
      db: mockDb,
      catalyst: mockCatalyst,
      entityPersister: mockEntityPersister
    })

    jest.clearAllMocks()
  })

  describe('get profiles', () => {
    describe('when there are no profiles in the cache', () => {
      beforeEach(() => {
        mockProfilesCache.getMany = jest.fn().mockReturnValueOnce(new Map())
      })

      describe('and the profiles are not found in the database', () => {
        beforeEach(() => {
          mockDb.getProfilesByPointers = jest.fn().mockResolvedValueOnce([])
        })

        describe('and the profiles are found in the catalyst', () => {
          let pointerA: string
          let pointerB: string
          let profilesFromCatalyst: Entity[]
          beforeEach(() => {
            pointerA = '0x123'
            pointerB = '0x456'
            profilesFromCatalyst = [
              createProfileEntity({ id: pointerA, pointers: [pointerA] }),
              createProfileEntity({ id: pointerB, pointers: [pointerB] })
            ]
            mockCatalyst.getEntityByPointers = jest.fn().mockResolvedValueOnce(profilesFromCatalyst)
          })

          it('should fetch the profiles from the catalyst and return them', async () => {
            const result = await component.getProfiles([pointerA, pointerB])
            expect(result).toEqual(
              new Map([
                [pointerA, profilesFromCatalyst[0]],
                [pointerB, profilesFromCatalyst[1]]
              ])
            )
          })

          it('should persist the profiles in the entity persister', async () => {
            await component.getProfiles([pointerA, pointerB])
            expect(mockEntityPersister.persistEntity).toHaveBeenCalledWith(profilesFromCatalyst[0])
            expect(mockEntityPersister.persistEntity).toHaveBeenCalledWith(profilesFromCatalyst[1])
          })
        })
      })

      describe('and all profiles are found in the database', () => {
        let pointerA: string
        let pointerB: string
        let profilesFromDB: Sync.ProfileDbEntity[]

        beforeEach(() => {
          pointerA = '0x123'
          pointerB = '0x456'
          profilesFromDB = [
            createProfileDbEntity({ id: pointerA, pointer: pointerA }),
            createProfileDbEntity({ id: pointerB, pointer: pointerB })
          ]
          mockDb.getProfilesByPointers = jest.fn().mockResolvedValueOnce(profilesFromDB)
        })

        it('should fetch the profiles from the database and return them', async () => {
          const result = await component.getProfiles([pointerA, pointerB])
          expect(result).toEqual(
            new Map([
              [pointerA, createProfileEntity({ id: pointerA, pointers: [pointerA] })],
              [pointerB, createProfileEntity({ id: pointerB, pointers: [pointerB] })]
            ])
          )
        })

        it('should not fetch the profiles from the catalyst', async () => {
          await component.getProfiles([pointerA, pointerB])
          expect(mockCatalyst.getEntityByPointers).not.toHaveBeenCalled()
        })
      })

      describe('and some profiles are found in the database and the rest are found in the catalyst', () => {
        let pointerA: string
        let pointerB: string
        let profilesFromDB: Sync.ProfileDbEntity[]

        beforeEach(() => {
          pointerA = '0x123'
          pointerB = '0x456'
          profilesFromDB = [createProfileDbEntity({ id: pointerA, pointer: pointerA })]
          mockDb.getProfilesByPointers = jest.fn().mockResolvedValueOnce(profilesFromDB)
          mockCatalyst.getEntityByPointers = jest
            .fn()
            .mockResolvedValueOnce([createProfileEntity({ id: pointerB, pointers: [pointerB] })])
        })

        it('should fetch profiles from database and catalyst and return them', async () => {
          const result = await component.getProfiles([pointerA, pointerB])
          expect(result).toEqual(
            new Map([
              [pointerA, createProfileEntity({ id: pointerA, pointers: [pointerA] })],
              [pointerB, createProfileEntity({ id: pointerB, pointers: [pointerB] })]
            ])
          )
        })

        it('should call database with both pointers', async () => {
          await component.getProfiles([pointerA, pointerB])
          expect(mockDb.getProfilesByPointers).toHaveBeenCalledWith([pointerA, pointerB])
        })

        it('should call catalyst with the pointer that is not in the database', async () => {
          await component.getProfiles([pointerA, pointerB])
          expect(mockCatalyst.getEntityByPointers).toHaveBeenCalledWith([pointerB])
        })
      })
    })

    describe('when some profiles are found in the cache and some are not', () => {
      let pointerA: string
      let pointerB: string
      let profilesFromCache: Entity[]

      beforeEach(() => {
        pointerA = '0x123'
        pointerB = '0x456'
        profilesFromCache = [createProfileEntity({ id: pointerA, pointers: [pointerA] })]
        mockProfilesCache.getMany = jest.fn().mockReturnValueOnce(new Map([[pointerA, profilesFromCache[0]]]))
      })

      describe('and the rest of profiles are found in the database', () => {
        beforeEach(() => {
          mockDb.getProfilesByPointers = jest
            .fn()
            .mockResolvedValueOnce([createProfileDbEntity({ id: pointerB, pointer: pointerB })])
        })

        it('should fetch profiles from cache and database and return them', async () => {
          const result = await component.getProfiles([pointerA, pointerB])
          expect(result).toEqual(
            new Map([
              [pointerA, profilesFromCache[0]],
              [pointerB, createProfileEntity({ id: pointerB, pointers: [pointerB] })]
            ])
          )
        })

        it('should call database with the pointer that is not in the cache', async () => {
          await component.getProfiles([pointerA, pointerB])
          expect(mockDb.getProfilesByPointers).toHaveBeenCalledWith([pointerB])
        })

        it('should not call catalyst', async () => {
          await component.getProfiles([pointerA, pointerB])
          expect(mockCatalyst.getEntityByPointers).not.toHaveBeenCalled()
        })
      })

      describe('and the rest of profiles are found in the catalyst', () => {
        beforeEach(() => {
          mockCatalyst.getEntityByPointers = jest
            .fn()
            .mockResolvedValueOnce([createProfileEntity({ id: pointerB, pointers: [pointerB] })])
        })

        it('should fetch profiles from cache and catalyst and return them', async () => {
          const result = await component.getProfiles([pointerA, pointerB])
          expect(result).toEqual(
            new Map([
              [pointerA, profilesFromCache[0]],
              [pointerB, createProfileEntity({ id: pointerB, pointers: [pointerB] })]
            ])
          )
        })

        it('should call database with the pointer that is not in the cache', async () => {
          await component.getProfiles([pointerA, pointerB])
          expect(mockDb.getProfilesByPointers).toHaveBeenCalledWith([pointerB])
        })

        it('should call catalyst with the pointer that is not in the cache', async () => {
          await component.getProfiles([pointerA, pointerB])
          expect(mockCatalyst.getEntityByPointers).toHaveBeenCalledWith([pointerB])
        })
      })
    })

    describe('when all profiles are found in the cache', () => {
      let pointerA: string
      let pointerB: string
      let profilesFromCache: Entity[]

      beforeEach(() => {
        pointerA = '0x123'
        pointerB = '0x456'
        profilesFromCache = [
          createProfileEntity({ id: pointerA, pointers: [pointerA] }),
          createProfileEntity({ id: pointerB, pointers: [pointerB] })
        ]
        mockProfilesCache.getMany = jest.fn().mockReturnValueOnce(
          new Map([
            [pointerA, profilesFromCache[0]],
            [pointerB, profilesFromCache[1]]
          ])
        )
      })

      it('should return the profiles from the cache', async () => {
        const result = await component.getProfiles([pointerA, pointerB])
        expect(result).toEqual(
          new Map([
            [pointerA, profilesFromCache[0]],
            [pointerB, profilesFromCache[1]]
          ])
        )
      })

      it('should not call database or catalyst', async () => {
        await component.getProfiles([pointerA, pointerB])
        expect(mockDb.getProfilesByPointers).not.toHaveBeenCalled()
        expect(mockCatalyst.getEntityByPointers).not.toHaveBeenCalled()
      })
    })
  })
})
