import { Entity, EntityType } from '@dcl/schemas'
import { Sync } from '../../src/types'
import { createRequestMaker } from '../utils'
import { test } from '../components'
import { createProfileDbEntity, createProfileEntity, createFullAvatar } from '../unit/mocks/data/profiles'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

function createTestLambdasProfile(entityId: string, pointer: string, name: string): Profile {
  return {
    timestamp: 1,
    avatars: [createFullAvatar({ ethAddress: pointer, name }, entityId)]
  }
}

function profileDbEntityToEntity(profileDb: Sync.ProfileDbEntity): Entity {
  return {
    version: 'v3' as const,
    id: profileDb.id,
    type: EntityType.PROFILE,
    pointers: [profileDb.pointer],
    timestamp: profileDb.timestamp,
    content: profileDb.content,
    metadata: profileDb.metadata
  }
}

function normalizeProfileDTOs(profiles: any[]): any[] {
  return profiles.map((p) => ({
    ...p,
    timestamp: typeof p.timestamp === 'string' ? Number(p.timestamp) : p.timestamp
  }))
}

test('POST /profiles endpoint', async function ({ components }) {
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
      pointer = '0xprofiledb111111111111111111111111111'
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

      const expectedProfile = components.profileSanitizer.mapEntitiesToProfiles([profileDbEntityToEntity(profile)])

      expect(response.status).toBe(200)
      expect(normalizeProfileDTOs(parsedResponse)).toEqual(expectedProfile)
    })
  })

  describe('when multiple profiles exist in the database', function () {
    let pointerA: string
    let pointerB: string
    let profileA: Sync.ProfileDbEntity
    let profileB: Sync.ProfileDbEntity

    beforeEach(async function () {
      pointerA = '0xprofilemulti11111111111111111111111'
      pointerB = '0xprofilemulti22222222222222222222222'
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

      const expectedProfiles = components.profileSanitizer.mapEntitiesToProfiles([
        profileDbEntityToEntity(profileA),
        profileDbEntityToEntity(profileB)
      ])

      expect(response.status).toBe(200)
      // Sort by timestamp for consistent comparison
      const normalizedResponse = normalizeProfileDTOs(parsedResponse)
      normalizedResponse.sort((a: any, b: any) => a.timestamp - b.timestamp)
      expectedProfiles.sort((a, b) => a.timestamp - b.timestamp)
      expect(normalizedResponse).toEqual(expectedProfiles)
    })
  })

  describe('when profile is not in database but exists in catalyst', function () {
    let pointer: string
    let lambdasProfile: Profile

    beforeEach(async function () {
      pointer = '0xcatalystprofile1111111111111111111'
      lambdasProfile = createTestLambdasProfile('bafkreicatalystprofile', pointer, 'CatalystUser')
      jest.spyOn(components.catalyst, 'getProfiles').mockResolvedValueOnce([lambdasProfile])
      jest.spyOn(components.catalyst, 'convertLambdasProfileToEntity').mockReturnValueOnce(
        profileDbEntityToEntity(
          createProfileDbEntity({
            id: 'bafkreicatalystprofile',
            pointer,
            metadata: {
              avatars: [createFullAvatar({ ethAddress: pointer, name: 'CatalystUser' }, 'bafkreicatalystprofile')]
            }
          })
        )
      )
      // Profile will be persisted by profile-retriever when fetched from catalyst
      profilesToCleanUp.push(pointer)
    })

    afterEach(async () => {
      await components.extendedDb.deleteProfiles([pointer])
    })

    it('should fetch from catalyst and return profile with snapshot URLs', async function () {
      const response = await fetchLocally('POST', '/profiles', undefined, { ids: [pointer] })
      const parsedResponse = await response.json()

      expect(response.status).toBe(200)
      expect(parsedResponse).toHaveLength(1)
      expect(parsedResponse[0].avatars[0].name).toBe('CatalystUser')
      expect(components.catalyst.getProfiles).toHaveBeenCalledWith([pointer])
    })
  })

  describe('when no profiles are found', function () {
    let pointer: string

    beforeEach(function () {
      pointer = '0xnonexistentprofile11111111111111111'
      jest.spyOn(components.catalyst, 'getProfiles').mockResolvedValueOnce([])
    })

    it('should return an empty array', async function () {
      const response = await fetchLocally('POST', '/profiles', undefined, { ids: [pointer] })
      const parsedResponse = await response.json()

      expect(response.status).toBe(200)
      expect(parsedResponse).toEqual([])
    })
  })
})
