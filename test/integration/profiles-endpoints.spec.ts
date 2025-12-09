import { Sync } from '../../src/types'
import { createRequestMaker } from '../utils'
import { test } from '../components'
import { createProfileDbEntity, createProfileEntity, createFullAvatar, createAvatarInfo } from '../unit/mocks/data/profiles'

test('POST /profiles endpoints', async function ({ components }) {
  let fetchLocally: any
  const profilesToCleanUp: string[] = []

  beforeAll(async function () {
    const { makeLocalRequest } = createRequestMaker(components)
    fetchLocally = makeLocalRequest
  })

  afterEach(async function () {
    if (profilesToCleanUp.length > 0) {
      await components.extendedDb.deleteProfiles(profilesToCleanUp)
      profilesToCleanUp.length = 0
    }
    jest.restoreAllMocks()
  })

  afterAll(async function () {
    await components.extendedDb.close()
  })

  async function createProfileOnDatabase(profile: Sync.ProfileDbEntity) {
    await components.db.upsertProfileIfNewer(profile)
    profilesToCleanUp.push(profile.pointer)
  }

  describe('POST /profiles/metadata', function () {
    describe('when profiles exist in the database', function () {
      it('should return the profile metadata', async function () {
        const pointer = '0xmetadata11111111111111111111111111111'
        const profile = createProfileDbEntity({
          id: 'bafkreimetadata1',
          pointer,
          metadata: {
            avatars: [createFullAvatar({ ethAddress: pointer, name: 'TestUser', hasClaimedName: true })]
          }
        })
        await createProfileOnDatabase(profile)

        const response = await fetchLocally('POST', '/profiles/metadata', undefined, { ids: [pointer] })
        const parsedResponse = await response.json()

        expect(response.status).toBe(200)
        expect(parsedResponse).toHaveLength(1)
        expect(parsedResponse[0].pointer).toBe(pointer)
        expect(parsedResponse[0].name).toBe('TestUser')
        expect(parsedResponse[0].hasClaimedName).toBe(true)
        expect(parsedResponse[0].thumbnailUrl).toContain(profile.id)
      })

      it('should return metadata for multiple profiles', async function () {
        const pointerA = '0xmetadatamulti1111111111111111111111'
        const pointerB = '0xmetadatamulti2222222222222222222222'
        await createProfileOnDatabase(
          createProfileDbEntity({
            id: 'bafkreimultiA',
            pointer: pointerA,
            metadata: { avatars: [createFullAvatar({ ethAddress: pointerA, name: 'UserA' })] }
          })
        )
        await createProfileOnDatabase(
          createProfileDbEntity({
            id: 'bafkreimultiB',
            pointer: pointerB,
            metadata: { avatars: [createFullAvatar({ ethAddress: pointerB, name: 'UserB' })] }
          })
        )

        const response = await fetchLocally('POST', '/profiles/metadata', undefined, { ids: [pointerA, pointerB] })
        const parsedResponse = await response.json()

        expect(response.status).toBe(200)
        expect(parsedResponse).toHaveLength(2)
      })
    })

    describe('when profile is not in database but exists in catalyst', function () {
      it('should fetch from catalyst and return metadata', async function () {
        const pointer = '0xcatalystmeta111111111111111111111111'
        const catalystProfile = createProfileEntity({
          id: 'bafkreicatalystmeta',
          pointers: [pointer],
          metadata: { avatars: [createFullAvatar({ ethAddress: pointer, name: 'CatalystUser', hasClaimedName: true })] }
        })
        jest.spyOn(components.catalyst, 'getEntityByPointers').mockResolvedValueOnce([catalystProfile])

        const response = await fetchLocally('POST', '/profiles/metadata', undefined, { ids: [pointer] })
        const parsedResponse = await response.json()

        expect(response.status).toBe(200)
        expect(parsedResponse).toHaveLength(1)
        expect(parsedResponse[0].name).toBe('CatalystUser')
        expect(components.catalyst.getEntityByPointers).toHaveBeenCalledWith([pointer])
      })
    })

    describe('when no profiles are found', function () {
      it('should return an empty array', async function () {
        jest.spyOn(components.catalyst, 'getEntityByPointers').mockResolvedValueOnce([])

        const response = await fetchLocally('POST', '/profiles/metadata', undefined, {
          ids: ['0xnonexistent1111111111111111111111111']
        })
        const parsedResponse = await response.json()

        expect(response.status).toBe(200)
        expect(parsedResponse).toEqual([])
      })
    })
  })

  describe('POST /profiles', function () {
    describe('when profiles exist in the database', function () {
      it('should return the profile with snapshot URLs', async function () {
        const pointer = '0xprofiledb111111111111111111111111111'
        const profile = createProfileDbEntity({
          id: 'bafkreiprofiledb1',
          pointer,
          metadata: {
            avatars: [createFullAvatar({ ethAddress: pointer, name: 'DBUser' })]
          }
        })
        await createProfileOnDatabase(profile)

        const response = await fetchLocally('POST', '/profiles', undefined, { ids: [pointer] })
        const parsedResponse = await response.json()

        expect(response.status).toBe(200)
        expect(parsedResponse).toHaveLength(1)
        expect(parsedResponse[0].id).toBe(profile.id)
        expect(parsedResponse[0].metadata.avatars[0].avatar.snapshots.face256).toContain(profile.id)
        expect(parsedResponse[0].metadata.avatars[0].avatar.snapshots.body).toContain(profile.id)
      })

      it('should return multiple profiles with snapshot URLs', async function () {
        const pointerA = '0xprofilemulti11111111111111111111111'
        const pointerB = '0xprofilemulti22222222222222222222222'
        const profileA = createProfileDbEntity({
          id: 'bafkreiprofileA',
          pointer: pointerA,
          metadata: { avatars: [createFullAvatar({ ethAddress: pointerA })] }
        })
        const profileB = createProfileDbEntity({
          id: 'bafkreiprofileB',
          pointer: pointerB,
          metadata: { avatars: [createFullAvatar({ ethAddress: pointerB })] }
        })
        await createProfileOnDatabase(profileA)
        await createProfileOnDatabase(profileB)

        const response = await fetchLocally('POST', '/profiles', undefined, { ids: [pointerA, pointerB] })
        const parsedResponse = await response.json()

        expect(response.status).toBe(200)
        expect(parsedResponse).toHaveLength(2)
        expect(parsedResponse.find((p: any) => p.id === profileA.id)).toBeDefined()
        expect(parsedResponse.find((p: any) => p.id === profileB.id)).toBeDefined()
      })
    })

    describe('when profile is not in database but exists in catalyst', function () {
      it('should fetch from catalyst and return profile with snapshot URLs', async function () {
        const pointer = '0xcatalystprofile1111111111111111111'
        const catalystProfile = createProfileEntity({
          id: 'bafkreicatalystprofile',
          pointers: [pointer],
          metadata: { avatars: [createFullAvatar({ ethAddress: pointer, name: 'CatalystUser' })] }
        })
        jest.spyOn(components.catalyst, 'getEntityByPointers').mockResolvedValueOnce([catalystProfile])

        const response = await fetchLocally('POST', '/profiles', undefined, { ids: [pointer] })
        const parsedResponse = await response.json()

        expect(response.status).toBe(200)
        expect(parsedResponse).toHaveLength(1)
        expect(parsedResponse[0].id).toBe(catalystProfile.id)
        expect(parsedResponse[0].metadata.avatars[0].avatar.snapshots.face256).toContain(catalystProfile.id)
        expect(components.catalyst.getEntityByPointers).toHaveBeenCalledWith([pointer])
      })
    })

    describe('when no profiles are found', function () {
      it('should return an empty array', async function () {
        jest.spyOn(components.catalyst, 'getEntityByPointers').mockResolvedValueOnce([])

        const response = await fetchLocally('POST', '/profiles', undefined, {
          ids: ['0xnonexistentprofile11111111111111111']
        })
        const parsedResponse = await response.json()

        expect(response.status).toBe(200)
        expect(parsedResponse).toEqual([])
      })
    })
  })
})
