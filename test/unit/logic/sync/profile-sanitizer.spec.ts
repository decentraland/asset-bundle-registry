import { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { ICatalystComponent, IProfileSanitizerComponent, Sync } from '../../../../src/types'
import { createConfigMockComponent } from '../../mocks/config'
import { createCatalystMockComponent } from '../../mocks/catalyst'
import { createProfileSanitizerComponent } from '../../../../src/logic/sync/profile-sanitizer'
import { createAvatar, createAvatarInfo, createProfileEntity } from '../../mocks/data/profiles'
import { Entity } from '@dcl/schemas'
import { createLogMockComponent } from '../../mocks/logs'

const MOCK_PROFILE_IMAGES_URL = 'https://profiles.mock.org'

describe('profile sanitizer', () => {
  let catalystMock: ICatalystComponent
  let configMock: IConfigComponent
  let logsMock: ILoggerComponent
  let component: IProfileSanitizerComponent

  beforeEach(async () => {
    catalystMock = createCatalystMockComponent()
    configMock = createConfigMockComponent()
    logsMock = createLogMockComponent()
    ;(configMock.requireString as jest.Mock).mockResolvedValue(MOCK_PROFILE_IMAGES_URL)
    component = await createProfileSanitizerComponent({ catalyst: catalystMock, config: configMock, logs: logsMock })
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

  describe('when mapping entities to profiles', () => {
    describe('when there are no profiles', () => {
      it('should return an empty array', () => {
        const result = component.mapEntitiesToProfiles([])
        expect(result).toEqual([])
      })
    })

    describe('when profiles have avatars with avatar property', () => {
      let entities: Entity[]
      let avatarA: any
      let avatarB: any
      let timestampA: number
      let timestampB: number

      beforeEach(() => {
        timestampA = 1000
        timestampB = 2000
        avatarA = createAvatar({ hasClaimedName: false, name: 'test1', avatar: createAvatarInfo() })
        avatarB = createAvatar({ hasClaimedName: true, name: 'test2', avatar: createAvatarInfo() })
        entities = [
          createProfileEntity({ id: 'bafz', timestamp: timestampA, metadata: { avatars: [avatarA] } }),
          createProfileEntity({ id: 'bafy', timestamp: timestampB, metadata: { avatars: [avatarB] } })
        ]
      })

      it('should return ProfileDTO array with timestamp and avatars with snapshot URLs', () => {
        const result = component.mapEntitiesToProfiles(entities)

        expect(result).toHaveLength(2)
        expect(result[0]).toEqual({
          timestamp: timestampA,
          avatars: [
            {
              ...avatarA,
              avatar: {
                ...avatarA.avatar,
                snapshots: {
                  face256: 'https://profiles.mock.org/entities/bafz/face.png',
                  body: 'https://profiles.mock.org/entities/bafz/body.png'
                }
              }
            }
          ]
        })
        expect(result[1]).toEqual({
          timestamp: timestampB,
          avatars: [
            {
              ...avatarB,
              avatar: {
                ...avatarB.avatar,
                snapshots: {
                  face256: 'https://profiles.mock.org/entities/bafy/face.png',
                  body: 'https://profiles.mock.org/entities/bafy/body.png'
                }
              }
            }
          ]
        })
      })

      it('should only return timestamp and avatars properties', () => {
        const result = component.mapEntitiesToProfiles(entities)

        expect(result[0]).not.toHaveProperty('id')
        expect(result[0]).not.toHaveProperty('metadata')
        expect(result[0]).not.toHaveProperty('pointers')
        expect(result[0]).toHaveProperty('timestamp')
        expect(result[0]).toHaveProperty('avatars')
      })
    })

    describe('when profiles have avatars without avatar property', () => {
      let entities: Entity[]
      let simpleAvatar: any
      let timestamp: number

      beforeEach(() => {
        timestamp = 1500
        simpleAvatar = createAvatar({ hasClaimedName: false, name: 'test1' })
        entities = [createProfileEntity({ id: 'bafz', timestamp, metadata: { avatars: [simpleAvatar] } })]
      })

      it('should return ProfileDTO with avatars unchanged', () => {
        const result = component.mapEntitiesToProfiles(entities)

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
          timestamp,
          avatars: [simpleAvatar]
        })
        expect(result[0].avatars[0].avatar).toBeUndefined()
      })
    })

    describe('when profiles have multiple avatars with mixed avatar properties', () => {
      let entities: Entity[]
      let avatarWithInfo: any
      let avatarWithoutInfo: any
      let timestamp: number

      beforeEach(() => {
        timestamp = 2500
        avatarWithInfo = createAvatar({ hasClaimedName: false, name: 'test1', avatar: createAvatarInfo() })
        avatarWithoutInfo = createAvatar({ hasClaimedName: true, name: 'test2' })
        entities = [
          createProfileEntity({ id: 'bafz', timestamp, metadata: { avatars: [avatarWithInfo, avatarWithoutInfo] } })
        ]
      })

      it('should add snapshots only to avatars with avatar property', () => {
        const result = component.mapEntitiesToProfiles(entities)

        expect(result[0].avatars).toHaveLength(2)
        expect(result[0].avatars[0].avatar?.snapshots).toEqual({
          face256: 'https://profiles.mock.org/entities/bafz/face.png',
          body: 'https://profiles.mock.org/entities/bafz/body.png'
        })
        expect(result[0].avatars[1]).toEqual(avatarWithoutInfo)
        expect(result[0].avatars[1].avatar).toBeUndefined()
      })
    })
  })
})
