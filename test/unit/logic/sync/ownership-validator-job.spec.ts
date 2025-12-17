import { IBaseComponent, IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { Entity } from '@dcl/schemas'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import {
  ICatalystComponent,
  IDbComponent,
  IProfileSanitizerComponent,
  IProfilesCacheComponent
} from '../../../../src/types'
import { createLogMockComponent } from '../../mocks/logs'
import { createCatalystMockComponent } from '../../mocks/catalyst'
import { createProfilesCacheMockComponent } from '../../mocks/profiles-cache'
import { createConfigMockComponent } from '../../mocks/config'
import { createDbMockComponent } from '../../mocks/db'
import { createOwnershipValidatorJob } from '../../../../src/logic/sync/ownership-validator-job'
import { createProfileSanitizerComponent } from '../../../../src/logic/sync/profile-sanitizer'
import { createProfileEntity, createAvatarInfo, createFullAvatar } from '../../mocks/data/profiles'

const FIVE_MINUTES_MS = 5 * 60 * 1000 // 5 minutes

function createStartOptions(): IBaseComponent.ComponentStartOptions {
  return {
    started: () => true,
    live: () => true,
    getComponents: () => ({})
  }
}

function createTestProfile(overrides: Partial<Profile> & { timestamp?: number } = {}): Profile {
  return {
    avatars: [],
    ...overrides
  }
}

describe('ownership validator job', () => {
  let mockLogs: ILoggerComponent
  let mockConfig: IConfigComponent
  let mockCatalyst: ICatalystComponent
  let mockProfilesCache: IProfilesCacheComponent
  let profileSanitizer: IProfileSanitizerComponent
  let mockDb: IDbComponent
  let component: IBaseComponent

  beforeEach(async () => {
    jest.useFakeTimers()

    mockLogs = createLogMockComponent()
    mockConfig = createConfigMockComponent()
    mockConfig.getNumber = jest.fn().mockResolvedValue(FIVE_MINUTES_MS)
    mockCatalyst = createCatalystMockComponent()
    mockProfilesCache = createProfilesCacheMockComponent()
    mockDb = createDbMockComponent()
    ;(mockConfig.requireString as jest.Mock).mockResolvedValue('https://profile-images.decentraland.org')

    profileSanitizer = await createProfileSanitizerComponent({
      catalyst: mockCatalyst,
      config: mockConfig,
      logs: mockLogs
    })
  })

  afterEach(async () => {
    if (component) {
      await component.stop?.()
    }
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  describe('when the component starts', () => {
    beforeEach(async () => {
      component = await createOwnershipValidatorJob({
        logs: mockLogs,
        config: mockConfig,
        catalyst: mockCatalyst,
        profilesCache: mockProfilesCache,
        profileSanitizer,
        db: mockDb
      })
    })

    describe('and the initial delay passes', () => {
      describe('and there are no profiles in cache', () => {
        beforeEach(async () => {
          ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValueOnce([])

          await component.start?.(createStartOptions())
          await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
        })

        it('should not fetch profiles from catalyst', () => {
          expect(mockCatalyst.getProfiles).not.toHaveBeenCalled()
        })
      })

      describe('and there are profiles in cache', () => {
        let pointers: string[]

        beforeEach(() => {
          pointers = ['0x1234567890123456789012345678901234567890']
        })

        describe('and fetching profiles from catalyst returns empty', () => {
          beforeEach(async () => {
            ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValueOnce(pointers)
            ;(mockCatalyst.getProfiles as jest.Mock).mockResolvedValueOnce([])

            await component.start?.(createStartOptions())
            await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
          })

          // note: there is no way to delete profiles from Catalyst
          it('should not update any profiles', () => {
            expect(mockProfilesCache.setIfNewer).not.toHaveBeenCalled()
            expect(mockDb.upsertProfileIfNewer).not.toHaveBeenCalled()
          })
        })

        describe('and profiles are fetched successfully', () => {
          let storedEntity: Entity

          beforeEach(() => {
            storedEntity = createProfileEntity({
              id: 'bafkreistoredentity',
              timestamp: 1000,
              pointers: [pointers[0]],
              metadata: {
                avatars: [
                  createFullAvatar({
                    userId: pointers[0],
                    avatar: createAvatarInfo({
                      wearables: ['urn:decentraland:matic:collections-v2:0x1:0'],
                      emotes: [{ urn: 'urn:decentraland:matic:collections-v2:0x2:0', slot: 0 }]
                    })
                  })
                ]
              }
            })
          })

          describe('and no profiles need updating', () => {
            let fetchedProfile: Profile

            beforeEach(async () => {
              fetchedProfile = createTestProfile({
                timestamp: 1000,
                avatars: [
                  createFullAvatar({
                    userId: pointers[0],
                    avatar: createAvatarInfo({
                      wearables: ['urn:decentraland:matic:collections-v2:0x1:0'],
                      emotes: [{ urn: 'urn:decentraland:matic:collections-v2:0x2:0', slot: 0 }]
                    })
                  })
                ]
              })
              ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValueOnce(pointers)
              ;(mockProfilesCache.get as jest.Mock).mockReturnValueOnce(storedEntity)
              ;(mockCatalyst.getProfiles as jest.Mock).mockResolvedValueOnce([fetchedProfile])

              await component.start?.(createStartOptions())
              await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
            })

            it('should not update any profiles', () => {
              expect(mockProfilesCache.setIfNewer).not.toHaveBeenCalled()
              expect(mockDb.upsertProfileIfNewer).not.toHaveBeenCalled()
            })
          })

          describe('and a profile has a newer timestamp', () => {
            let fetchedProfile: Profile
            let fetchedEntity: Entity

            beforeEach(async () => {
              fetchedProfile = createTestProfile({
                timestamp: 2000,
                avatars: [
                  createFullAvatar({
                    userId: pointers[0],
                    avatar: createAvatarInfo({
                      wearables: ['urn:decentraland:matic:collections-v2:0x1:0'],
                      emotes: [{ urn: 'urn:decentraland:matic:collections-v2:0x2:0', slot: 0 }]
                    })
                  })
                ]
              })

              fetchedEntity = createProfileEntity({
                id: 'bafkreifetchedentity',
                timestamp: 2000,
                pointers: [pointers[0]],
                metadata: {
                  avatars: [
                    createFullAvatar({
                      userId: pointers[0],
                      avatar: createAvatarInfo({
                        wearables: ['urn:decentraland:matic:collections-v2:0x1:0'],
                        emotes: [{ urn: 'urn:decentraland:matic:collections-v2:0x2:0', slot: 0 }]
                      })
                    })
                  ]
                }
              })
              ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValueOnce(pointers)
              ;(mockProfilesCache.get as jest.Mock).mockReturnValueOnce(storedEntity)
              ;(mockCatalyst.getProfiles as jest.Mock).mockResolvedValueOnce([fetchedProfile])
              ;(mockCatalyst.getEntityByPointers as jest.Mock).mockResolvedValueOnce([fetchedEntity])

              await component.start?.(createStartOptions())
              await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
            })

            it('should fetch the entity from catalyst', () => {
              expect(mockCatalyst.getEntityByPointers).toHaveBeenCalledWith([pointers[0]])
            })

            it('should update profile in cache', () => {
              expect(mockProfilesCache.setIfNewer).toHaveBeenCalledWith(
                pointers[0],
                expect.objectContaining({
                  id: fetchedEntity.id,
                  timestamp: fetchedEntity.timestamp,
                  pointers: [pointers[0]]
                })
              )
            })

            it('should update profile in db', () => {
              expect(mockDb.upsertProfileIfNewer).toHaveBeenCalledWith(
                expect.objectContaining({
                  id: fetchedEntity.id,
                  pointer: pointers[0],
                  timestamp: fetchedEntity.timestamp
                })
              )
            })
          })

          describe('and fetched profile has different wearables', () => {
            let fetchedProfile: Profile
            let fetchedEntity: Entity

            beforeEach(async () => {
              fetchedProfile = createTestProfile({
                timestamp: 1000,
                avatars: [
                  createFullAvatar({
                    userId: pointers[0],
                    avatar: createAvatarInfo({
                      wearables: ['urn:decentraland:matic:collections-v2:should-persist'],
                      emotes: [{ urn: 'urn:decentraland:matic:collections-v2:0x2:0', slot: 0 }]
                    })
                  })
                ]
              })

              fetchedEntity = createProfileEntity({
                id: 'bafkreifetchedentity',
                timestamp: 1000,
                pointers: [pointers[0]],
                metadata: {
                  avatars: [
                    createFullAvatar({
                      userId: pointers[0],
                      avatar: createAvatarInfo({
                        wearables: ['urn:decentraland:matic:collections-v2:should-persist'],
                        emotes: [{ urn: 'urn:decentraland:matic:collections-v2:0x2:0', slot: 0 }]
                      })
                    })
                  ]
                }
              })
              ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValueOnce(pointers)
              ;(mockProfilesCache.get as jest.Mock).mockReturnValueOnce(storedEntity)
              ;(mockCatalyst.getProfiles as jest.Mock).mockResolvedValueOnce([fetchedProfile])
              ;(mockCatalyst.getEntityByPointers as jest.Mock).mockResolvedValueOnce([fetchedEntity])

              await component.start?.(createStartOptions())
              await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
            })

            it('should update the profile in cache', () => {
              expect(mockProfilesCache.setIfNewer).toHaveBeenCalledWith(
                pointers[0],
                expect.objectContaining({
                  id: fetchedEntity.id,
                  timestamp: fetchedEntity.timestamp
                })
              )
            })

            it('should update the profile in db', () => {
              expect(mockDb.upsertProfileIfNewer).toHaveBeenCalledWith(
                expect.objectContaining({
                  id: fetchedEntity.id,
                  pointer: pointers[0],
                  timestamp: fetchedEntity.timestamp,
                  metadata: expect.objectContaining({
                    avatars: [
                      expect.objectContaining({
                        avatar: expect.objectContaining({
                          wearables: ['urn:decentraland:matic:collections-v2:should-persist']
                        })
                      })
                    ]
                  })
                })
              )
            })
          })

          describe('and fetched profile has different emotes', () => {
            let fetchedProfile: Profile
            let fetchedEntity: Entity

            beforeEach(async () => {
              fetchedProfile = createTestProfile({
                timestamp: 1000,
                avatars: [
                  createFullAvatar({
                    userId: pointers[0],
                    avatar: createAvatarInfo({
                      wearables: ['urn:decentraland:matic:collections-v2:0x1:0'],
                      emotes: [{ urn: 'urn:decentraland:matic:collections-v2:should-persist', slot: 0 }]
                    })
                  })
                ]
              })

              fetchedEntity = createProfileEntity({
                id: 'bafkreifetchedentity',
                timestamp: 1000,
                pointers: [pointers[0]],
                metadata: {
                  avatars: [
                    createFullAvatar({
                      userId: pointers[0],
                      avatar: createAvatarInfo({
                        wearables: ['urn:decentraland:matic:collections-v2:0x1:0'],
                        emotes: [{ urn: 'urn:decentraland:matic:collections-v2:should-persist', slot: 0 }]
                      })
                    })
                  ]
                }
              })
              ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValueOnce(pointers)
              ;(mockProfilesCache.get as jest.Mock).mockReturnValueOnce(storedEntity)
              ;(mockCatalyst.getProfiles as jest.Mock).mockResolvedValueOnce([fetchedProfile])
              ;(mockCatalyst.getEntityByPointers as jest.Mock).mockResolvedValueOnce([fetchedEntity])

              await component.start?.(createStartOptions())
              await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
            })

            it('should update the profile in cache', () => {
              expect(mockProfilesCache.setIfNewer).toHaveBeenCalledWith(
                pointers[0],
                expect.objectContaining({
                  id: fetchedEntity.id,
                  timestamp: fetchedEntity.timestamp
                })
              )
            })

            it('should update the profile in db', () => {
              expect(mockDb.upsertProfileIfNewer).toHaveBeenCalledWith(
                expect.objectContaining({
                  id: fetchedEntity.id,
                  pointer: pointers[0],
                  timestamp: fetchedEntity.timestamp,
                  metadata: expect.objectContaining({
                    avatars: [
                      expect.objectContaining({
                        avatar: expect.objectContaining({
                          emotes: [{ urn: 'urn:decentraland:matic:collections-v2:should-persist', slot: 0 }]
                        })
                      })
                    ]
                  })
                })
              )
            })
          })

          describe('and fetching entity by pointer fails', () => {
            let fetchedProfile: Profile

            beforeEach(async () => {
              fetchedProfile = createTestProfile({
                timestamp: 2000,
                avatars: [
                  createFullAvatar({
                    userId: pointers[0],
                    avatar: createAvatarInfo({
                      wearables: ['urn:decentraland:matic:collections-v2:0x1:0'],
                      emotes: [{ urn: 'urn:decentraland:matic:collections-v2:0x2:0', slot: 0 }]
                    })
                  })
                ]
              })
              ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValueOnce(pointers)
              ;(mockProfilesCache.get as jest.Mock).mockReturnValueOnce(storedEntity)
              ;(mockCatalyst.getProfiles as jest.Mock).mockResolvedValueOnce([fetchedProfile])
              ;(mockCatalyst.getEntityByPointers as jest.Mock).mockResolvedValueOnce([])

              await component.start?.(createStartOptions())
              await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
            })

            it('should not update the profile in cache or db', () => {
              expect(mockProfilesCache.setIfNewer).not.toHaveBeenCalled()
              expect(mockDb.upsertProfileIfNewer).not.toHaveBeenCalled()
            })
          })
        })
      })
    })
  })

  describe('stop', () => {
    describe('when the validator is stopped after running', () => {
      beforeEach(async () => {
        ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValue([])

        component = await createOwnershipValidatorJob({
          logs: mockLogs,
          config: mockConfig,
          catalyst: mockCatalyst,
          profilesCache: mockProfilesCache,
          profileSanitizer,
          db: mockDb
        })

        await component.start?.(createStartOptions())
        await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
      })

      it('should clear the validation interval', async () => {
        await component.stop?.()
        ;(mockProfilesCache.getAllPointers as jest.Mock).mockClear()

        await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)

        expect(mockProfilesCache.getAllPointers).not.toHaveBeenCalled()
      })
    })

    describe('when stop is called before initial delay', () => {
      beforeEach(async () => {
        ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValue([])

        component = await createOwnershipValidatorJob({
          logs: mockLogs,
          config: mockConfig,
          catalyst: mockCatalyst,
          profilesCache: mockProfilesCache,
          profileSanitizer,
          db: mockDb
        })

        await component.start?.(createStartOptions())
        await component.stop?.()
        ;(mockProfilesCache.getAllPointers as jest.Mock).mockClear()

        await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
      })

      it('should not run validation cycle', () => {
        expect(mockProfilesCache.getAllPointers).not.toHaveBeenCalled()
      })
    })
  })

  describe('periodic validation', () => {
    describe('when the validator runs multiple cycles', () => {
      let pointers: string[]

      beforeEach(async () => {
        pointers = ['0x1234567890123456789012345678901234567890']
        ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValue(pointers)
        ;(mockCatalyst.getProfiles as jest.Mock).mockResolvedValue([])

        component = await createOwnershipValidatorJob({
          logs: mockLogs,
          config: mockConfig,
          catalyst: mockCatalyst,
          profilesCache: mockProfilesCache,
          profileSanitizer,
          db: mockDb
        })
      })

      describe('and multiple intervals pass', () => {
        beforeEach(async () => {
          await component.start?.(createStartOptions())
          await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS * 3)
        })

        it('should run validation cycles at each interval', () => {
          expect(mockProfilesCache.getAllPointers).toHaveBeenCalledTimes(3)
        })
      })
    })
  })

  describe('batch processing', () => {
    describe('when validating profiles in batches', () => {
      let pointers: string[]

      beforeEach(async () => {
        pointers = Array.from({ length: 75 }, (_, i) => `0x${i.toString().padStart(40, '0')}`)

        component = await createOwnershipValidatorJob({
          logs: mockLogs,
          config: mockConfig,
          catalyst: mockCatalyst,
          profilesCache: mockProfilesCache,
          profileSanitizer,
          db: mockDb
        })
      })

      describe('and all profiles are processed', () => {
        beforeEach(async () => {
          ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValueOnce(pointers)
          ;(mockCatalyst.getProfiles as jest.Mock).mockResolvedValue([])

          await component.start?.(createStartOptions())
          await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS + 200)
        })

        it('should call getProfiles twice (50 + 25)', () => {
          expect(mockCatalyst.getProfiles).toHaveBeenCalledTimes(2)
          expect(mockCatalyst.getProfiles).toHaveBeenNthCalledWith(1, pointers.slice(0, 50))
          expect(mockCatalyst.getProfiles).toHaveBeenNthCalledWith(2, pointers.slice(50, 75))
        })
      })

      describe('and stop is called mid-batch', () => {
        beforeEach(async () => {
          ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValueOnce(pointers)
          ;(mockCatalyst.getProfiles as jest.Mock).mockImplementation(async () => {
            await component.stop?.()
            return []
          })

          await component.start?.(createStartOptions())
          await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS)
        })

        it('should stop processing remaining batches', () => {
          expect(mockCatalyst.getProfiles).toHaveBeenCalledTimes(1)
        })
      })

      describe('and an error occurs in one batch', () => {
        beforeEach(async () => {
          ;(mockProfilesCache.getAllPointers as jest.Mock).mockReturnValueOnce(pointers)
          ;(mockCatalyst.getProfiles as jest.Mock)
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new Error('Batch error'))

          await component.start?.(createStartOptions())
          await jest.advanceTimersByTimeAsync(FIVE_MINUTES_MS + 200)
        })

        it('should catch the error and complete the cycle', () => {
          expect(mockCatalyst.getProfiles).toHaveBeenCalledTimes(2)
        })
      })
    })
  })
})
