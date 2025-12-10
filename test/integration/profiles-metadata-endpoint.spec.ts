import { Entity } from '@dcl/schemas'
import { Sync } from '../../src/types'
import { createRequestMaker } from '../utils'
import { test } from '../components'
import { createProfileDbEntity, createProfileEntity, createFullAvatar } from '../unit/mocks/data/profiles'

test('POST /profiles/metadata endpoint', async function ({ components }) {
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
      pointer = '0xmetadata11111111111111111111111111111'
      profile = createProfileDbEntity({
        id: 'bafkreimetadata1',
        pointer,
        metadata: {
          avatars: [createFullAvatar({ ethAddress: pointer, name: 'TestUser', hasClaimedName: true })]
        }
      })
      await createProfileOnDatabase(profile)
    })

    it('should return the profile metadata', async function () {
      const response = await fetchLocally('POST', '/profiles/metadata', undefined, { ids: [pointer] })
      const parsedResponse = await response.json()

      expect(response.status).toBe(200)
      expect(parsedResponse).toHaveLength(1)
      expect(parsedResponse[0].pointer).toBe(pointer)
      expect(parsedResponse[0].name).toBe('TestUser')
      expect(parsedResponse[0].hasClaimedName).toBe(true)
      expect(parsedResponse[0].thumbnailUrl).toContain(profile.id)
    })
  })

  describe('when multiple profiles exist in the database', function () {
    let pointerA: string
    let pointerB: string

    beforeEach(async function () {
      pointerA = '0xmetadatamulti1111111111111111111111'
      pointerB = '0xmetadatamulti2222222222222222222222'
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
    })

    it('should return metadata for all profiles', async function () {
      const response = await fetchLocally('POST', '/profiles/metadata', undefined, { ids: [pointerA, pointerB] })
      const parsedResponse = await response.json()

      expect(response.status).toBe(200)
      expect(parsedResponse).toHaveLength(2)
    })
  })

  describe('when profile is not in database but exists in catalyst', function () {
    let pointer: string
    let catalystProfile: Entity

    beforeEach(function () {
      pointer = '0xcatalystmeta111111111111111111111111'
      catalystProfile = createProfileEntity({
        id: 'bafkreicatalystmeta',
        pointers: [pointer],
        metadata: { avatars: [createFullAvatar({ ethAddress: pointer, name: 'CatalystUser', hasClaimedName: true })] }
      })
      jest.spyOn(components.catalyst, 'getEntityByPointers').mockResolvedValueOnce([catalystProfile])
    })

    it('should fetch from catalyst and return metadata', async function () {
      const response = await fetchLocally('POST', '/profiles/metadata', undefined, { ids: [pointer] })
      const parsedResponse = await response.json()

      expect(response.status).toBe(200)
      expect(parsedResponse).toHaveLength(1)
      expect(parsedResponse[0].name).toBe('CatalystUser')
      expect(components.catalyst.getEntityByPointers).toHaveBeenCalledWith([pointer])
    })
  })

  describe('when no profiles are found', function () {
    let pointer: string

    beforeEach(function () {
      pointer = '0xnonexistent1111111111111111111111111'
      jest.spyOn(components.catalyst, 'getEntityByPointers').mockResolvedValueOnce([])
    })

    it('should return an empty array', async function () {
      const response = await fetchLocally('POST', '/profiles/metadata', undefined, { ids: [pointer] })
      const parsedResponse = await response.json()

      expect(response.status).toBe(200)
      expect(parsedResponse).toEqual([])
    })
  })
})
