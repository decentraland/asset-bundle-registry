import { IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { ICatalystComponent, IProfileSanitizerComponent, Sync } from '../../../../src/types'
import { createConfigMockComponent } from '../../mocks/config'
import { createCatalystMockComponent } from '../../mocks/catalyst'
import { createProfileSanitizerComponent } from '../../../../src/logic/sync/profile-sanitizer'
import { createAvatar, createAvatarInfo, createProfileEntity } from '../../mocks/data/profiles'
import { Entity, Profile } from '@dcl/schemas'
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
      let pointerA: string
      let pointerB: string
      let entityA: Entity
      let entityB: Entity
      let profilesToSanitize: Sync.ProfileDeployment[]

      beforeEach(() => {
        entityIdA = 'bafz'
        entityIdB = 'bafy'
        pointerA = '0x1111111111111111111111111111111111111111'
        pointerB = '0x2222222222222222222222222222222222222222'
        entityA = createProfileEntity({
          id: entityIdA,
          pointers: [pointerA],
          metadata: { avatars: [createAvatar({ userId: pointerA, ethAddress: pointerA })] }
        })
        entityB = createProfileEntity({
          id: entityIdB,
          pointers: [pointerB],
          metadata: { avatars: [createAvatar({ userId: pointerB, ethAddress: pointerB })] }
        })
        profilesToSanitize = [
          { entityId: entityIdA, pointer: pointerA, timestamp: 1 },
          { entityId: entityIdB, pointer: pointerB, timestamp: 2 }
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
          catalystMock.getEntitiesByIds = jest.fn().mockResolvedValueOnce([entityA, entityB])
        })

        it('should return the profiles', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())
          expect(result).toEqual([entityA, entityB])
        })

        it('should not call callback', async () => {
          const notFoundProfilesHandler = jest.fn()
          await component.sanitizeProfiles(profilesToSanitize, notFoundProfilesHandler)
          expect(notFoundProfilesHandler).not.toHaveBeenCalled()
        })
      })

      describe('and a fetched profile points somewhere else than its deployment', () => {
        beforeEach(() => {
          catalystMock.getEntitiesByIds = jest.fn().mockResolvedValueOnce([
            createProfileEntity({
              id: entityIdA,
              pointers: [pointerB],
              metadata: { avatars: [createAvatar({ userId: pointerB, ethAddress: pointerB })] }
            }),
            entityB
          ])
        })

        it('should discard it and keep the consistent one', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())

          expect(result).toEqual([entityB])
        })
      })

      describe('and a fetched profile carries no avatars', () => {
        beforeEach(() => {
          catalystMock.getEntitiesByIds = jest
            .fn()
            .mockResolvedValueOnce([
              createProfileEntity({ id: entityIdA, pointers: [pointerA], metadata: {} }),
              entityB
            ])
        })

        it('should discard it so it is never stored or served', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())

          expect(result).toEqual([entityB])
        })
      })

      describe('and a fetched profile carries an empty avatars array', () => {
        beforeEach(() => {
          catalystMock.getEntitiesByIds = jest
            .fn()
            .mockResolvedValueOnce([
              createProfileEntity({ id: entityIdA, pointers: [pointerA], metadata: { avatars: [] } }),
              entityB
            ])
        })

        it('should discard it', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())

          expect(result).toEqual([entityB])
        })
      })

      describe('and a fetched profile has no pointers', () => {
        beforeEach(() => {
          catalystMock.getEntitiesByIds = jest.fn().mockResolvedValueOnce([
            createProfileEntity({
              id: entityIdA,
              pointers: [],
              metadata: { avatars: [createAvatar({ userId: pointerA, ethAddress: pointerA })] }
            }),
            entityB
          ])
        })

        it('should discard it', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())

          expect(result).toEqual([entityB])
        })
      })

      describe('and a fetched profile pointer differs only in casing', () => {
        beforeEach(() => {
          catalystMock.getEntitiesByIds = jest.fn().mockResolvedValueOnce([
            createProfileEntity({
              id: entityIdA,
              pointers: [pointerA.toUpperCase()],
              metadata: { avatars: [createAvatar({ userId: pointerA, ethAddress: pointerA })] }
            })
          ])
        })

        it('should keep it, since pointers are compared normalized', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())

          expect(result).toHaveLength(1)
        })
      })

      describe('and a fetched avatar carries an address other than the pointer', () => {
        beforeEach(() => {
          catalystMock.getEntitiesByIds = jest.fn().mockResolvedValueOnce([
            createProfileEntity({
              id: entityIdA,
              pointers: [pointerA],
              metadata: {
                avatars: [createAvatar({ userId: pointerB, ethAddress: pointerB, avatar: createAvatarInfo() })]
              }
            })
          ])
        })

        it('should settle the ethAddress to the pointer before it is stored', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())

          expect((result[0].metadata as Profile).avatars[0].ethAddress).toEqual(pointerA)
        })

        it('should settle the userId to the pointer before it is stored', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())

          expect((result[0].metadata as Profile).avatars[0].userId).toEqual(pointerA)
        })
      })

      describe('and the fetched profile is a default profile', () => {
        const deployedAddress = '0x3333333333333333333333333333333333333333'

        beforeEach(() => {
          profilesToSanitize = [{ entityId: entityIdA, pointer: 'default5', timestamp: 1 }]
          catalystMock.getEntitiesByIds = jest.fn().mockResolvedValueOnce([
            createProfileEntity({
              id: entityIdA,
              pointers: ['default5'],
              metadata: {
                avatars: [
                  createAvatar({ userId: deployedAddress, ethAddress: deployedAddress, avatar: createAvatarInfo() })
                ]
              }
            })
          ])
        })

        it('should leave the deployed identity untouched, since its pointer is a name', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())

          expect((result[0].metadata as Profile).avatars[0].ethAddress).toEqual(deployedAddress)
        })
      })

      describe('and some profiles are not found in catalyst', () => {
        beforeEach(async () => {
          catalystMock.getEntitiesByIds = jest.fn().mockResolvedValueOnce([entityA])
        })

        it('should return the profiles', async () => {
          const result = await component.sanitizeProfiles(profilesToSanitize, jest.fn())
          expect(result).toEqual([entityA])
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
          pointers: ['default5'],
          metadata: {
            avatars: [
              {
                hasClaimedName: false,
                name: 'test',
                nameColor: { r: 1, g: 2, b: 3 }
              }
            ]
          }
        })
      })

      it('should return the metadata', () => {
        const result = component.getMetadata(entity)
        expect(result).toEqual({
          pointer: 'default5',
          hasClaimedName: false,
          name: 'test',
          nameColor: { r: 1, g: 2, b: 3 },
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
