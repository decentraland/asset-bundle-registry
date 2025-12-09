import { IConfigComponent } from '@well-known-components/interfaces'
import { ICatalystComponent, IProfileSanitizerComponent, Sync } from '../../../../src/types'
import { createConfigMockComponent } from '../../mocks/config'
import { createCatalystMockComponent } from '../../mocks/catalyst'
import { createProfileSanitizerComponent } from '../../../../src/logic/sync/profile-sanitizer'
import { createAvatar, createProfile, createProfileEntity } from '../../mocks/data/profiles'
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

      beforeEach(() => {
        entities = [
          createProfileEntity({
            id: 'bafz',
            metadata: {
              avatars: [
                {
                  hasClaimedName: false,
                  name: 'test1',
                  avatar: {
                    bodyShape: 'dcl://base-avatars/BaseFemale',
                    eyes: { color: { r: 0.5, g: 0.5, b: 0.5 } },
                    hair: { color: { r: 0.3, g: 0.3, b: 0.3 } },
                    skin: { color: { r: 0.8, g: 0.7, b: 0.6 } }
                  }
                }
              ]
            }
          }),
          createProfileEntity({
            id: 'bafy',
            metadata: {
              avatars: [
                {
                  hasClaimedName: true,
                  name: 'test2',
                  avatar: {
                    bodyShape: 'dcl://base-avatars/BaseMale',
                    eyes: { color: { r: 0.6, g: 0.6, b: 0.6 } },
                    hair: { color: { r: 0.4, g: 0.4, b: 0.4 } },
                    skin: { color: { r: 0.9, g: 0.8, b: 0.7 } }
                  }
                }
              ]
            }
          })
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

        expect(result[0].metadata.avatars[0].hasClaimedName).toBe(false)
        expect(result[0].metadata.avatars[0].name).toBe('test1')
        expect(result[0].metadata.avatars[0].avatar?.bodyShape).toBe('dcl://base-avatars/BaseFemale')
        expect(result[1].metadata.avatars[0].hasClaimedName).toBe(true)
        expect(result[1].metadata.avatars[0].name).toBe('test2')
        expect(result[1].metadata.avatars[0].avatar?.bodyShape).toBe('dcl://base-avatars/BaseMale')
      })

      it('should preserve all other entity properties', () => {
        const result = component.getProfilesWithSnapshotsAsUrls(entities)

        expect(result[0].id).toBe('bafz')
        expect(result[0].version).toBe(entities[0].version)
        expect(result[0].type).toBe(entities[0].type)
        expect(result[0].timestamp).toBe(entities[0].timestamp)
        expect(result[0].pointers).toEqual(entities[0].pointers)
        expect(result[0].content).toEqual(entities[0].content)
      })
    })

    describe('when profiles have avatars without avatar property', () => {
      let entities: Entity[]

      beforeEach(() => {
        entities = [
          createProfileEntity({
            id: 'bafz',
            metadata: {
              avatars: [
                {
                  hasClaimedName: false,
                  name: 'test1'
                }
              ]
            }
          })
        ]
      })

      it('should return profiles with avatars unchanged', () => {
        const result = component.getProfilesWithSnapshotsAsUrls(entities)

        expect(result).toHaveLength(1)
        expect(result[0].metadata.avatars[0]).toEqual({
          hasClaimedName: false,
          name: 'test1'
        })
        expect(result[0].metadata.avatars[0].avatar).toBeUndefined()
      })
    })

    describe('when profiles have multiple avatars with mixed avatar properties', () => {
      let entities: Entity[]

      beforeEach(() => {
        entities = [
          createProfileEntity({
            id: 'bafz',
            metadata: {
              avatars: [
                {
                  hasClaimedName: false,
                  name: 'test1',
                  avatar: {
                    bodyShape: 'dcl://base-avatars/BaseFemale',
                    eyes: { color: { r: 0.5, g: 0.5, b: 0.5 } }
                  }
                },
                {
                  hasClaimedName: true,
                  name: 'test2'
                }
              ]
            }
          })
        ]
      })

      it('should add snapshots only to avatars with avatar property', () => {
        const result = component.getProfilesWithSnapshotsAsUrls(entities)

        expect(result[0].metadata.avatars).toHaveLength(2)
        expect(result[0].metadata.avatars[0].avatar?.snapshots).toEqual({
          face256: 'https://profiles.mock.org/entities/bafz/face.png',
          body: 'https://profiles.mock.org/entities/bafz/body.png'
        })
        expect(result[0].metadata.avatars[1].avatar).toBeUndefined()
        expect(result[0].metadata.avatars[1]).toEqual({
          hasClaimedName: true,
          name: 'test2'
        })
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

      beforeEach(() => {
        ethAddressA = '0x123'
        ethAddressB = '0x456'
        profiles = [
          createProfile({
            avatars: [
              createAvatar({
                ethAddress: ethAddressA,
                version: 1000
              })
            ]
          }),
          createProfile({
            avatars: [
              createAvatar({
                ethAddress: ethAddressB,
                version: 2000
              })
            ]
          })
        ]
      })

      it('should return all profiles as entities', () => {
        const result = component.mapProfilesToEntities(profiles)

        expect(result).toHaveLength(2)
        expect(result[0].id).toBe(ethAddressA)
        expect(result[0].pointers).toEqual([ethAddressA.toLowerCase()])
        expect(result[0].timestamp).toBe(1000)
        expect(result[0].metadata.avatars).toEqual(profiles[0].avatars)
        expect(result[1].id).toBe(ethAddressB)
        expect(result[1].pointers).toEqual([ethAddressB.toLowerCase()])
        expect(result[1].timestamp).toBe(2000)
        expect(result[1].metadata.avatars).toEqual(profiles[1].avatars)
      })
    })
  })
})
