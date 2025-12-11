import { Entity } from '@dcl/schemas'
import { Sync } from '../../src/types'
import { createRequestMaker } from '../utils'
import { test } from '../components'
import { createProfileDbEntity, createProfileEntity, createFullAvatar } from '../unit/mocks/data/profiles'

test('POST /profile endpoint', async function ({ components }) {
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

  describe('when a single profile exists in the database', function () {
    let pointer: string
    let profile: Sync.ProfileDbEntity

    beforeEach(async function () {
      pointer = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      profile = createProfileDbEntity({
        id: 'bafkreiprofiledb1',
        pointer,
        metadata: {
          avatars: [createFullAvatar({ ethAddress: pointer, name: 'DBUser' })]
        }
      })
      await createProfileOnDatabase(profile)
    })

    it('should return the profile with snapshot URLs', async function () {
      const response = await fetchLocally('POST', '/profiles', undefined, { ids: [pointer] })
      const parsedResponse = await response.json()

      expect(response.status).toBe(200)
      expect(parsedResponse).toHaveLength(1)
      expect(parsedResponse[0].id).toBe(profile.id)
      expect(parsedResponse[0].metadata.avatars[0].avatar.snapshots.face256).toContain(profile.id)
      expect(parsedResponse[0].metadata.avatars[0].avatar.snapshots.body).toContain(profile.id)
    })
  })

  describe('when multiple profiles exist in the database', function () {
    let pointerA: string
    let pointerB: string
    let profileA: Sync.ProfileDbEntity
    let profileB: Sync.ProfileDbEntity

    beforeEach(async function () {
      pointerA = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'
      pointerB = '0x8ba1f109551bD432803012645aac136c22C9290'
      profileA = createProfileDbEntity({
        id: 'bafkreiprofileA',
        pointer: pointerA,
        metadata: { avatars: [createFullAvatar({ ethAddress: pointerA })] }
      })
      profileB = createProfileDbEntity({
        id: 'bafkreiprofileB',
        pointer: pointerB,
        metadata: { avatars: [createFullAvatar({ ethAddress: pointerB })] }
      })
      await createProfileOnDatabase(profileA)
      await createProfileOnDatabase(profileB)
    })

    it('should return all profiles with snapshot URLs', async function () {
      const response = await fetchLocally('POST', '/profiles', undefined, { ids: [pointerA, pointerB] })
      const parsedResponse = await response.json()

      expect(response.status).toBe(200)
      expect(parsedResponse).toHaveLength(2)
      expect(parsedResponse.find((p: any) => p.id === profileA.id)).toBeDefined()
      expect(parsedResponse.find((p: any) => p.id === profileB.id)).toBeDefined()
    })
  })

  describe('when profile is not in database but exists in catalyst', function () {
    let pointer: string
    let catalystProfile: Entity

    beforeEach(function () {
      pointer = '0x1234567890123456789012345678901234567890'
      catalystProfile = createProfileEntity({
        id: 'bafkreicatalystprofile',
        pointers: [pointer],
        metadata: { avatars: [createFullAvatar({ ethAddress: pointer, name: 'CatalystUser' })] }
      })
      jest.spyOn(components.catalyst, 'getEntityByPointers').mockResolvedValueOnce([catalystProfile])
    })

    it('should fetch from catalyst and return profile with snapshot URLs', async function () {
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
    let pointer: string

    beforeEach(function () {
      pointer = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'
      jest.spyOn(components.catalyst, 'getEntityByPointers').mockResolvedValueOnce([])
    })

    it('should return an empty array', async function () {
      const response = await fetchLocally('POST', '/profiles', undefined, { ids: [pointer] })
      const parsedResponse = await response.json()

      expect(response.status).toBe(200)
      expect(parsedResponse).toEqual([])
    })
  })
})
