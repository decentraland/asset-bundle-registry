import { IConfigComponent, IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { IContentStorageComponent } from '@dcl/catalyst-storage'
import { EntityType } from '@dcl/schemas'
import {
  IDbComponent,
  IEntityPersisterComponent,
  IProfileSanitizerComponent,
  IProfilesSynchronizerComponent
} from '../../../../src/types'
import { createConfigMockComponent } from '../../mocks/config'
import { createDbMockComponent } from '../../mocks/db'
import { createProfileSanitizerMockComponent } from '../../mocks/profile-sanitizer'
import { createLogMockComponent } from '../../mocks/logs'
import { createFetchMockComponent } from '../../mocks/fetch'
import { createEntityPersisterMockComponent } from '../../mocks/entity-persister'
import { createSnapshotContentStorageMockComponent } from '../../mocks/snapshot-content-storage'
import { createSnapshotsHandlerComponent } from '../../../../src/logic/sync/snapshots-handler'
import { createSnapshotMetadata } from '../../mocks/data/snapshots'
import { parseToEntity } from '../../mocks/data/pointer-changes'

jest.mock('@dcl/snapshots-fetcher', () => ({
  getDeployedEntitiesStreamFromSnapshot: jest.fn()
}))

import { getDeployedEntitiesStreamFromSnapshot } from '@dcl/snapshots-fetcher'
const mockGetDeployedEntitiesStreamFromSnapshot = getDeployedEntitiesStreamFromSnapshot as jest.Mock

describe('snapshots-handler', () => {
  let mockConfig: IConfigComponent
  let mockLogs: ILoggerComponent
  let mockFetch: IFetchComponent
  let mockDb: IDbComponent
  let mockProfileSanitizer: IProfileSanitizerComponent
  let mockEntityPersister: IEntityPersisterComponent
  let mockSnapshotContentStorage: IContentStorageComponent
  let component: IProfilesSynchronizerComponent

  beforeEach(async () => {
    mockConfig = createConfigMockComponent()
    ;(mockConfig.requireString as jest.Mock).mockResolvedValue('https://catalyst.decentraland.test')
    mockLogs = createLogMockComponent()
    mockFetch = createFetchMockComponent()
    mockDb = createDbMockComponent()
    mockProfileSanitizer = createProfileSanitizerMockComponent()
    mockEntityPersister = createEntityPersisterMockComponent()
    mockSnapshotContentStorage = createSnapshotContentStorageMockComponent()

    component = await createSnapshotsHandlerComponent({
      config: mockConfig,
      logs: mockLogs,
      fetch: mockFetch,
      db: mockDb,
      profileSanitizer: mockProfileSanitizer,
      entityPersister: mockEntityPersister,
      snapshotContentStorage: mockSnapshotContentStorage
    })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('syncProfiles', () => {
    describe('when syncing profiles from a timestamp', () => {
      let fromTimestamp: number
      let abortController: AbortController
      let abortSignal: AbortSignal

      beforeEach(() => {
        fromTimestamp = 1700000000000
        abortController = new AbortController()
        abortSignal = abortController.signal
      })

      describe('and fetching snapshots fails', () => {
        beforeEach(() => {
          ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error'
          })
        })

        it('should return the original fromTimestamp', async () => {
          const result = await component.syncProfiles(fromTimestamp, abortSignal)

          expect(result).toBe(fromTimestamp)
        })
      })

      describe('and there are no snapshots to process', () => {
        beforeEach(() => {
          ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue([])
          })
        })

        it('should return the original fromTimestamp', async () => {
          const result = await component.syncProfiles(fromTimestamp, abortSignal)

          expect(result).toBe(fromTimestamp)
        })
      })

      describe('and all snapshots are older than fromTimestamp', () => {
        beforeEach(() => {
          const oldSnapshot = createSnapshotMetadata({
            timeRange: {
              initTimestamp: fromTimestamp - 200000000,
              endTimestamp: fromTimestamp - 100000000
            }
          })
          ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue([oldSnapshot])
          })
        })

        it('should return the original fromTimestamp', async () => {
          const result = await component.syncProfiles(fromTimestamp, abortSignal)

          expect(result).toBe(fromTimestamp)
        })
      })

      describe('and there are snapshots to process', () => {
        let snapshot: ReturnType<typeof createSnapshotMetadata>

        beforeEach(() => {
          snapshot = createSnapshotMetadata({
            hash: 'bafkreisnapshot123456789012345678901234567890123456789012345',
            timeRange: {
              initTimestamp: fromTimestamp,
              endTimestamp: fromTimestamp + 100000000
            }
          })
          ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValue([snapshot])
          })
        })

        describe('and the snapshot has already been processed', () => {
          beforeEach(() => {
            ;(mockDb.isSnapshotProcessed as jest.Mock).mockResolvedValueOnce(true)
          })

          it('should skip the snapshot', async () => {
            await component.syncProfiles(fromTimestamp, abortSignal)

            expect(mockDb.isSnapshotProcessed).toHaveBeenCalledWith(snapshot.hash)
            expect(mockDb.markSnapshotProcessed).not.toHaveBeenCalled()
          })

          it('should return the snapshot end timestamp', async () => {
            const result = await component.syncProfiles(fromTimestamp, abortSignal)

            expect(result).toBe(snapshot.timeRange.endTimestamp)
          })
        })

        describe('and the snapshot has not been processed', () => {
          beforeEach(() => {
            ;(mockDb.isSnapshotProcessed as jest.Mock).mockResolvedValueOnce(false)
          })

          describe('and the snapshot contains no profile entities', () => {
            beforeEach(() => {
              async function* emptyStream() {
                // yields nothing
              }
              mockGetDeployedEntitiesStreamFromSnapshot.mockReturnValueOnce(emptyStream())
            })

            it('should mark the snapshot as processed', async () => {
              await component.syncProfiles(fromTimestamp, abortSignal)

              expect(mockDb.markSnapshotProcessed).toHaveBeenCalledWith(snapshot.hash)
            })

            it('should return the snapshot end timestamp', async () => {
              const result = await component.syncProfiles(fromTimestamp, abortSignal)

              expect(result).toBe(snapshot.timeRange.endTimestamp)
            })
          })

          describe('and the snapshot contains profile entities', () => {
            let profileEntity: {
              entityId: string
              entityType: string
              entityTimestamp: number
              pointers: string[]
              authChain: Array<{ type: string; payload: string; signature: string }>
            }
            let sanitizedEntity: ReturnType<typeof parseToEntity>

            beforeEach(() => {
              profileEntity = {
                entityId: 'bafkreiprofile12345678901234567890123456789012345678901234567',
                entityType: EntityType.PROFILE.toLowerCase(),
                entityTimestamp: fromTimestamp + 50000000,
                pointers: ['0x1234567890123456789012345678901234567890'],
                authChain: [{ type: 'SIGNER', payload: '0x1234567890123456789012345678901234567890', signature: '' }]
              }
              sanitizedEntity = parseToEntity({
                entityId: profileEntity.entityId,
                entityTimestamp: profileEntity.entityTimestamp,
                pointers: profileEntity.pointers,
                metadata: { avatars: [] }
              })

              async function* profileStream() {
                yield profileEntity
              }
              mockGetDeployedEntitiesStreamFromSnapshot.mockReturnValueOnce(profileStream())
              ;(mockProfileSanitizer.sanitizeProfiles as jest.Mock).mockResolvedValueOnce([sanitizedEntity])
            })

            it('should sanitize and persist the profiles', async () => {
              await component.syncProfiles(fromTimestamp, abortSignal)

              expect(mockProfileSanitizer.sanitizeProfiles).toHaveBeenCalled()
              expect(mockEntityPersister.persistEntity).toHaveBeenCalledWith(sanitizedEntity)
            })

            it('should mark the snapshot as processed', async () => {
              await component.syncProfiles(fromTimestamp, abortSignal)

              expect(mockDb.markSnapshotProcessed).toHaveBeenCalledWith(snapshot.hash)
            })

            it('should return the highest entity timestamp', async () => {
              const result = await component.syncProfiles(fromTimestamp, abortSignal)

              expect(result).toBe(snapshot.timeRange.endTimestamp)
            })
          })

          describe('and the snapshot contains non-profile entities', () => {
            beforeEach(() => {
              const sceneEntity = {
                entityId: 'bafkreiscene123456789012345678901234567890123456789012345678',
                entityType: EntityType.SCENE.toLowerCase(),
                entityTimestamp: fromTimestamp + 50000000,
                pointers: ['-10,-10'],
                authChain: []
              }

              async function* sceneStream() {
                yield sceneEntity
              }
              mockGetDeployedEntitiesStreamFromSnapshot.mockReturnValueOnce(sceneStream())
            })

            it('should not call sanitizer for non-profile entities', async () => {
              await component.syncProfiles(fromTimestamp, abortSignal)

              expect(mockProfileSanitizer.sanitizeProfiles).not.toHaveBeenCalled()
            })
          })
        })

        describe('and there are multiple snapshots', () => {
          let firstSnapshot: ReturnType<typeof createSnapshotMetadata>
          let secondSnapshot: ReturnType<typeof createSnapshotMetadata>

          beforeEach(() => {
            firstSnapshot = createSnapshotMetadata({
              hash: 'bafkreifirstsnapshot234567890123456789012345678901234567890',
              timeRange: {
                initTimestamp: fromTimestamp,
                endTimestamp: fromTimestamp + 50000000
              }
            })
            secondSnapshot = createSnapshotMetadata({
              hash: 'bafkreisecondsnapshot34567890123456789012345678901234567890',
              timeRange: {
                initTimestamp: fromTimestamp + 50000000,
                endTimestamp: fromTimestamp + 100000000
              }
            })
            ;(mockFetch.fetch as jest.Mock).mockReset()
            ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
              ok: true,
              json: jest.fn().mockResolvedValue([firstSnapshot, secondSnapshot])
            })
            ;(mockDb.isSnapshotProcessed as jest.Mock).mockResolvedValue(false)

            async function* emptyStream() {
              // yields nothing
            }
            mockGetDeployedEntitiesStreamFromSnapshot
              .mockReturnValueOnce(emptyStream())
              .mockReturnValueOnce(emptyStream())
          })

          it('should process all snapshots in order', async () => {
            await component.syncProfiles(fromTimestamp, abortSignal)

            expect(mockDb.markSnapshotProcessed).toHaveBeenCalledTimes(2)
            expect(mockDb.markSnapshotProcessed).toHaveBeenNthCalledWith(1, firstSnapshot.hash)
            expect(mockDb.markSnapshotProcessed).toHaveBeenNthCalledWith(2, secondSnapshot.hash)
          })

          it('should return the highest timestamp across all snapshots', async () => {
            const result = await component.syncProfiles(fromTimestamp, abortSignal)

            expect(result).toBe(secondSnapshot.timeRange.endTimestamp)
          })
        })

        describe('and the abort signal is triggered', () => {
          let firstSnapshot: ReturnType<typeof createSnapshotMetadata>
          let secondSnapshot: ReturnType<typeof createSnapshotMetadata>

          beforeEach(() => {
            firstSnapshot = createSnapshotMetadata({
              hash: 'bafkreifirstsnapshot234567890123456789012345678901234567890',
              timeRange: {
                initTimestamp: fromTimestamp,
                endTimestamp: fromTimestamp + 50000000
              }
            })
            secondSnapshot = createSnapshotMetadata({
              hash: 'bafkreisecondsnapshot34567890123456789012345678901234567890',
              timeRange: {
                initTimestamp: fromTimestamp + 50000000,
                endTimestamp: fromTimestamp + 100000000
              }
            })
            ;(mockFetch.fetch as jest.Mock).mockReset()
            ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
              ok: true,
              json: jest.fn().mockResolvedValue([firstSnapshot, secondSnapshot])
            })
            ;(mockDb.isSnapshotProcessed as jest.Mock).mockImplementation(async () => {
              abortController.abort()
              return false
            })
          })

          it('should stop processing and return the last processed timestamp', async () => {
            const result = await component.syncProfiles(fromTimestamp, abortSignal)

            expect(mockDb.markSnapshotProcessed).not.toHaveBeenCalled()
            expect(result).toBe(fromTimestamp)
          })
        })
      })
    })
  })
})
