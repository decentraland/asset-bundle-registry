import { IConfigComponent } from '@well-known-components/interfaces'
import { ICatalystComponent, IProfileSanitizerComponent, Sync } from '../../../../src/types'
import { createConfigMockComponent } from '../../mocks/config'
import { createCatalystMockComponent } from '../../mocks/catalyst'
import { createProfileSanitizerComponent } from '../../../../src/logic/sync/profile-sanitizer'
import { createAvatar, createAvatarInfo, createProfile, createProfileEntity } from '../../mocks/data/profiles'
import { Entity, Profile, EntityType } from '@dcl/schemas'

const MOCK_PROFILE_IMAGES_URL = 'https://profiles.mock.org'

describe('profile sanitizer', () => {
  let catalystMock: ICatalystComponent
  let configMock: IConfigComponent
  let component: IProfileSanitizerComponent

  beforeEach(async () => {
    catalystMock = createCatalystMockComponent()
    configMock = createConfigMockComponent()
    ;(configMock.requireString as jest.Mock).mockResolvedValue(MOCK_PROFILE_IMAGES_URL)
    component = await createProfileSanitizerComponent({ catalyst: catalystMock, config: configMock })
  })

  describe('when sanitizing profiles', () => {
    describe('when there are no profiles to sanitize', () => {
      it('should return an empty array', async () => {
        const result = await component.sanitizeProfiles([], jest.fn())
        expect(result).toEqual([])
      })
    })

    describe('when there are profiles to sanitize', () => {
      let entityIdA: string
      let entityIdB: string
      let profilesToSanitize: Sync.ProfileDeployment[]

      beforeEach(() => {
        entityIdA = 'bafz'
        entityIdB = 'bafy'
        profilesToSanitize = [
          { entityId: entityIdA, pointer: '0x123', timestamp: 1 },
          { entityId: entityIdB, pointer: '0x456', timestamp: 2 }
        ]
      })

      describe('and the profiles are not found in catalyst', () => {
        beforeEach(async () => {
          catalystMock.getEntitiesByIds = jest.fn().mockResolvedValueOnce([])
        })

        it('should return an empty array', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())
          expect(result).toEqual([])
        })

        it('should call callback with not found profiles', async () => {
          const notFoundProfilesHandler = jest.fn()
          await component.sanitizeProfiles(profilesToSanitize, notFoundProfilesHandler)
          expect(notFoundProfilesHandler).toHaveBeenCalledWith(profilesToSanitize[0])
          expect(notFoundProfilesHandler).toHaveBeenCalledWith(profilesToSanitize[1])
        })
      })

      describe('and all profiles are found in catalyst', () => {
        beforeEach(async () => {
          catalystMock.getEntitiesByIds = jest
            .fn()
            .mockResolvedValueOnce([createProfileEntity({ id: entityIdA }), createProfileEntity({ id: entityIdB })])
        })

        it('should return the profiles', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())
          expect(result).toEqual([createProfileEntity({ id: entityIdA }), createProfileEntity({ id: entityIdB })])
        })

        it('should not call callback', async () => {
          const notFoundProfilesHandler = jest.fn()
          await component.sanitizeProfiles(profilesToSanitize, notFoundProfilesHandler)
          expect(notFoundProfilesHandler).not.toHaveBeenCalled()
        })
      })

      describe('and some profiles are not found in catalyst', () => {
        beforeEach(async () => {
          catalystMock.getEntitiesByIds = jest.fn().mockResolvedValueOnce([createProfileEntity({ id: entityIdA })])
        })

        it('should return the profiles', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())
          expect(result).toEqual([createProfileEntity({ id: entityIdA })])
        })

        it('should call callback with not found profiles', async () => {
          const notFoundProfilesHandler = jest.fn()
          await component.sanitizeProfiles(profilesToSanitize, notFoundProfilesHandler)
          expect(notFoundProfilesHandler).toHaveBeenCalledWith(profilesToSanitize.find((p) => p.entityId === entityIdB))
        })
      })
    })
  })

  describe('when getting metadata', () => {
    let entity: Entity

    describe('when the profile has avatar', () => {
      beforeEach(() => {
        entity = createProfileEntity({
          id: 'bafz',
          pointers: ['0x123'],
          metadata: {
            avatars: [
              {
                hasClaimedName: false,
                name: 'test'
              }
            ]
          }
        })
      })

      it('should return the metadata', () => {
        const result = component.getMetadata(entity)
        expect(result).toEqual({
          pointer: '0x123',
          hasClaimedName: false,
          name: 'test',
          thumbnailUrl: 'https://profiles.mock.org/entities/bafz/face.png'
        })
      })
    })
  })

  describe('when getting profiles with snapshots as urls', () => {
    describe('when there are no profiles', () => {
      it('should return an empty array', () => {
        const result = component.getProfilesWithSnapshotsAsUrls([])
        expect(result).toEqual([])
      })
    })

    describe('when profiles have avatars with avatar property', () => {
      let entities: Entity[]
      let avatarA: any
      let avatarB: any

      beforeEach(() => {
        avatarA = createAvatar({ hasClaimedName: false, name: 'test1', avatar: createAvatarInfo() })
        avatarB = createAvatar({ hasClaimedName: true, name: 'test2', avatar: createAvatarInfo() })
        entities = [
          createProfileEntity({ id: 'bafz', metadata: { avatars: [avatarA] } }),
          createProfileEntity({ id: 'bafy', metadata: { avatars: [avatarB] } })
        ]
      })

      it('should return profiles with snapshots URLs added to avatar snapshots', () => {
        const result = component.getProfilesWithSnapshotsAsUrls(entities)

        expect(result).toHaveLength(2)
        expect(result[0].metadata.avatars[0].avatar?.snapshots).toEqual({
          face256: 'https://profiles.mock.org/entities/bafz/face.png',
          body: 'https://profiles.mock.org/entities/bafz/body.png'
        })
        expect(result[1].metadata.avatars[0].avatar?.snapshots).toEqual({
          face256: 'https://profiles.mock.org/entities/bafy/face.png',
          body: 'https://profiles.mock.org/entities/bafy/body.png'
        })
      })

      it('should preserve all other avatar properties', () => {
        const result = component.getProfilesWithSnapshotsAsUrls(entities)

        const expectedAvatarA = {
          ...avatarA,
          avatar: { ...avatarA.avatar, snapshots: result[0].metadata.avatars[0].avatar?.snapshots }
        }
        const expectedAvatarB = {
          ...avatarB,
          avatar: { ...avatarB.avatar, snapshots: result[1].metadata.avatars[0].avatar?.snapshots }
        }
        expect(result[0].metadata.avatars[0]).toEqual(expectedAvatarA)
        expect(result[1].metadata.avatars[0]).toEqual(expectedAvatarB)
      })

      it('should preserve all other entity properties', () => {
        const result = component.getProfilesWithSnapshotsAsUrls(entities)

        expect(result[0]).toEqual({
          ...entities[0],
          metadata: { avatars: [result[0].metadata.avatars[0]] }
        })
      })
    })

    describe('when profiles have avatars without avatar property', () => {
      let entities: Entity[]
      let simpleAvatar: any

      beforeEach(() => {
        simpleAvatar = createAvatar({ hasClaimedName: false, name: 'test1' })
        entities = [createProfileEntity({ id: 'bafz', metadata: { avatars: [simpleAvatar] } })]
      })

      it('should return profiles with avatars unchanged', () => {
        const result = component.getProfilesWithSnapshotsAsUrls(entities)

        expect(result).toHaveLength(1)
        expect(result[0].metadata.avatars[0]).toEqual(simpleAvatar)
        expect(result[0].metadata.avatars[0].avatar).toBeUndefined()
      })
    })

    describe('when profiles have multiple avatars with mixed avatar properties', () => {
      let entities: Entity[]
      let avatarWithInfo: any
      let avatarWithoutInfo: any

      beforeEach(() => {
        avatarWithInfo = createAvatar({ hasClaimedName: false, name: 'test1', avatar: createAvatarInfo() })
        avatarWithoutInfo = createAvatar({ hasClaimedName: true, name: 'test2' })
        entities = [createProfileEntity({ id: 'bafz', metadata: { avatars: [avatarWithInfo, avatarWithoutInfo] } })]
      })

      it('should add snapshots only to avatars with avatar property', () => {
        const result = component.getProfilesWithSnapshotsAsUrls(entities)

        expect(result[0].metadata.avatars).toHaveLength(2)
        expect(result[0].metadata.avatars[0].avatar?.snapshots).toEqual({
          face256: 'https://profiles.mock.org/entities/bafz/face.png',
          body: 'https://profiles.mock.org/entities/bafz/body.png'
        })
        expect(result[0].metadata.avatars[1]).toEqual(avatarWithoutInfo)
        expect(result[0].metadata.avatars[1].avatar).toBeUndefined()
      })
    })
  })

  describe('when mapping profiles to entities', () => {
    describe('when there are no profiles', () => {
      it('should return an empty array', () => {
        const result = component.mapProfilesToEntities([])
        expect(result).toEqual([])
      })
    })

    describe('when there is a single profile', () => {
      let profile: Profile
      let ethAddress: string
      let avatarVersion: number

      beforeEach(() => {
        ethAddress = '0x123'
        avatarVersion = 1234567890
        profile = createProfile({
          avatars: [
            createAvatar({
              ethAddress,
              version: avatarVersion
            })
          ]
        })
      })

      it('should return the profile as an entity with correct properties', () => {
        const result = component.mapProfilesToEntities([profile])

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
          version: 'v3',
          id: ethAddress,
          type: EntityType.PROFILE,
          pointers: [ethAddress.toLowerCase()],
          timestamp: avatarVersion,
          content: [],
          metadata: {
            avatars: profile.avatars
          }
        })
      })
    })

    describe('when there are multiple profiles', () => {
      let profiles: Profile[]
      let ethAddressA: string
      let ethAddressB: string
      let avatarA: any
      let avatarB: any

      beforeEach(() => {
        ethAddressA = '0x123'
        ethAddressB = '0x456'
        avatarA = createAvatar({ ethAddress: ethAddressA, version: 1000 })
        avatarB = createAvatar({ ethAddress: ethAddressB, version: 2000 })
        profiles = [createProfile({ avatars: [avatarA] }), createProfile({ avatars: [avatarB] })]
      })

      it('should return all profiles as entities', () => {
        const result = component.mapProfilesToEntities(profiles)

        expect(result).toEqual([
          {
            version: 'v3',
            id: ethAddressA,
            type: EntityType.PROFILE,
            pointers: [ethAddressA.toLowerCase()],
            timestamp: 1000,
            content: [],
            metadata: { avatars: [avatarA] }
          },
          {
            version: 'v3',
            id: ethAddressB,
            type: EntityType.PROFILE,
            pointers: [ethAddressB.toLowerCase()],
            timestamp: 2000,
            content: [],
            metadata: { avatars: [avatarB] }
          }
        ])
      })
    })
  })
})
