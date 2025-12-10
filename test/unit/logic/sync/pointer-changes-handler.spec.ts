import { IConfigComponent, IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'
import { EntityType } from '@dcl/schemas'
import {
  IDbComponent,
  IEntityDeploymentTrackerComponent,
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
import { createEntityDeploymentTrackerMockComponent } from '../../mocks/entity-deployment-tracker'
import { createPointerChangesHandlerComponent } from '../../../../src/logic/sync/pointer-changes-handler'
import { createValidPointerChangesResponse, parseToEntity } from '../../mocks/data/pointer-changes'

describe('pointer-changes-handler', () => {
  let mockConfig: IConfigComponent
  let mockLogs: ILoggerComponent
  let mockFetch: IFetchComponent
  let mockDb: IDbComponent
  let mockProfileSanitizer: IProfileSanitizerComponent
  let mockEntityPersister: IEntityPersisterComponent
  let mockEntityDeploymentTracker: IEntityDeploymentTrackerComponent
  let component: IProfilesSynchronizerComponent

  beforeEach(async () => {
    mockConfig = createConfigMockComponent()
    ;(mockConfig.requireString as jest.Mock).mockResolvedValue('https://catalyst.decentraland.test')
    mockLogs = createLogMockComponent()
    mockFetch = createFetchMockComponent()
    mockDb = createDbMockComponent()
    mockProfileSanitizer = createProfileSanitizerMockComponent()
    mockEntityPersister = createEntityPersisterMockComponent()
    mockEntityDeploymentTracker = createEntityDeploymentTrackerMockComponent()

    component = await createPointerChangesHandlerComponent({
      config: mockConfig,
      logs: mockLogs,
      fetch: mockFetch,
      db: mockDb,
      profileSanitizer: mockProfileSanitizer,
      entityPersister: mockEntityPersister,
      entityDeploymentTracker: mockEntityDeploymentTracker
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
        fromTimestamp = 1000
        abortController = new AbortController()
        abortSignal = abortController.signal
      })

      describe('and the stream returns no entities', () => {
        beforeEach(() => {
          ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
            json: jest.fn().mockResolvedValue({ deltas: [] }),
            status: 200,
            ok: true
          })
        })

        it('should return the original fromTimestamp', async () => {
          const result = await component.syncProfiles(fromTimestamp, abortSignal)

          expect(result).toBe(fromTimestamp)
        })
      })

      describe('and the stream returns entities', () => {
        describe('and the entity is not a profile', () => {
          let sceneEntity: ReturnType<typeof createValidPointerChangesResponse>

          beforeEach(() => {
            sceneEntity = createValidPointerChangesResponse({ entityType: EntityType.SCENE })
            ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
              json: jest.fn().mockResolvedValue({ deltas: [sceneEntity] }),
              status: 200,
              ok: true
            })
          })

          it('should skip the entity and not call sanitizer', async () => {
            await component.syncProfiles(fromTimestamp, abortSignal)

            expect(mockProfileSanitizer.sanitizeProfiles).not.toHaveBeenCalled()
          })
        })

        describe('and the entity is a profile', () => {
          describe('and the entity has already been processed', () => {
            let profileEntity: ReturnType<typeof createValidPointerChangesResponse>

            beforeEach(() => {
              profileEntity = createValidPointerChangesResponse()
              ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
                json: jest.fn().mockResolvedValue({ deltas: [profileEntity] }),
                status: 200,
                ok: true
              })
              ;(mockEntityDeploymentTracker.hasBeenProcessed as jest.Mock).mockReturnValueOnce(true)
            })

            it('should skip the entity and not call sanitizer', async () => {
              await component.syncProfiles(fromTimestamp, abortSignal)

              expect(mockEntityDeploymentTracker.hasBeenProcessed).toHaveBeenCalledWith(profileEntity.entityId)
              expect(mockProfileSanitizer.sanitizeProfiles).not.toHaveBeenCalled()
            })
          })

          describe('and the entity has not been processed', () => {
            let profileEntity: ReturnType<typeof createValidPointerChangesResponse>

            beforeEach(() => {
              profileEntity = createValidPointerChangesResponse()
              ;(mockEntityDeploymentTracker.hasBeenProcessed as jest.Mock).mockReturnValue(false)
            })

            describe('and sanitization returns empty array', () => {
              beforeEach(() => {
                ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
                  json: jest.fn().mockResolvedValue({ deltas: [profileEntity] }),
                  status: 200,
                  ok: true
                })
                ;(mockProfileSanitizer.sanitizeProfiles as jest.Mock).mockResolvedValueOnce([])
              })

              it('should not persist the entity', async () => {
                await component.syncProfiles(fromTimestamp, abortSignal)

                expect(mockProfileSanitizer.sanitizeProfiles).toHaveBeenCalled()
                expect(mockEntityPersister.persistEntity).not.toHaveBeenCalled()
              })
            })

            describe('and sanitization returns a valid profile', () => {
              let sanitizedEntity: ReturnType<typeof parseToEntity>

              beforeEach(() => {
                sanitizedEntity = parseToEntity(profileEntity)
                ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
                  json: jest.fn().mockResolvedValue({ deltas: [profileEntity] }),
                  status: 200,
                  ok: true
                })
                ;(mockProfileSanitizer.sanitizeProfiles as jest.Mock).mockResolvedValueOnce([sanitizedEntity])
              })

              it('should persist the sanitized profile', async () => {
                await component.syncProfiles(fromTimestamp, abortSignal)

                expect(mockEntityPersister.persistEntity).toHaveBeenCalledWith(sanitizedEntity)
              })

              it('should return the entity timestamp', async () => {
                const result = await component.syncProfiles(fromTimestamp, abortSignal)

                expect(result).toBe(profileEntity.entityTimestamp)
              })
            })
          })
        })

        describe('and the stream returns multiple profile entities', () => {
          let firstProfileEntity: ReturnType<typeof createValidPointerChangesResponse>
          let secondProfileEntity: ReturnType<typeof createValidPointerChangesResponse>
          let firstSanitizedEntity: ReturnType<typeof parseToEntity>
          let secondSanitizedEntity: ReturnType<typeof parseToEntity>

          beforeEach(() => {
            firstProfileEntity = createValidPointerChangesResponse({
              entityId: 'bafkreig3u7bhiu37wdlv5v2pk6if36xtkgqzkod35rqd7ay23prnuiphg1',
              pointers: ['0x0000000000000000000000000000000000000001'],
              entityTimestamp: 2000
            })
            secondProfileEntity = createValidPointerChangesResponse({
              entityId: 'bafkreig3u7bhiu37wdlv5v2pk6if36xtkgqzkod35rqd7ay23prnuiphg2',
              pointers: ['0x0000000000000000000000000000000000000002'],
              entityTimestamp: 3000
            })
            firstSanitizedEntity = parseToEntity(firstProfileEntity)
            secondSanitizedEntity = parseToEntity(secondProfileEntity)

            ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
              json: jest.fn().mockResolvedValue({ deltas: [firstProfileEntity, secondProfileEntity] }),
              status: 200,
              ok: true
            })
            ;(mockEntityDeploymentTracker.hasBeenProcessed as jest.Mock).mockReturnValue(false)
            ;(mockProfileSanitizer.sanitizeProfiles as jest.Mock)
              .mockResolvedValueOnce([firstSanitizedEntity])
              .mockResolvedValueOnce([secondSanitizedEntity])
          })

          it('should persist all sanitized profiles', async () => {
            await component.syncProfiles(fromTimestamp, abortSignal)

            expect(mockEntityPersister.persistEntity).toHaveBeenCalledTimes(2)
            expect(mockEntityPersister.persistEntity).toHaveBeenNthCalledWith(1, firstSanitizedEntity)
            expect(mockEntityPersister.persistEntity).toHaveBeenNthCalledWith(2, secondSanitizedEntity)
          })

          it('should return the highest entity timestamp', async () => {
            const result = await component.syncProfiles(fromTimestamp, abortSignal)

            expect(result).toBe(3000)
          })
        })
      })

      describe('and the stream returns paginated results', () => {
        let firstPageEntity: ReturnType<typeof createValidPointerChangesResponse>
        let secondPageEntity: ReturnType<typeof createValidPointerChangesResponse>
        let firstSanitizedEntity: ReturnType<typeof parseToEntity>
        let secondSanitizedEntity: ReturnType<typeof parseToEntity>

        beforeEach(() => {
          firstPageEntity = createValidPointerChangesResponse({
            entityId: 'bafkreig3u7bhiu37wdlv5v2pk6if36xtkgqzkod35rqd7ay23prnuiphg1',
            pointers: ['0x0000000000000000000000000000000000000001'],
            entityTimestamp: 2000,
            localTimestamp: 2001
          })
          secondPageEntity = createValidPointerChangesResponse({
            entityId: 'bafkreig3u7bhiu37wdlv5v2pk6if36xtkgqzkod35rqd7ay23prnuiphg2',
            pointers: ['0x0000000000000000000000000000000000000002'],
            entityTimestamp: 4000,
            localTimestamp: 4001
          })
          firstSanitizedEntity = parseToEntity(firstPageEntity)
          secondSanitizedEntity = parseToEntity(secondPageEntity)

          ;(mockFetch.fetch as jest.Mock)
            .mockResolvedValueOnce({
              json: jest.fn().mockResolvedValue({
                deltas: [firstPageEntity],
                pagination: { next: '/pointer-changes?offset=500' }
              }),
              status: 200,
              ok: true
            })
            .mockResolvedValueOnce({
              json: jest.fn().mockResolvedValue({
                deltas: [secondPageEntity]
              }),
              status: 200,
              ok: true
            })
          ;(mockEntityDeploymentTracker.hasBeenProcessed as jest.Mock).mockReturnValue(false)
          ;(mockProfileSanitizer.sanitizeProfiles as jest.Mock)
            .mockResolvedValueOnce([firstSanitizedEntity])
            .mockResolvedValueOnce([secondSanitizedEntity])
        })

        it('should process entities from all pages', async () => {
          await component.syncProfiles(fromTimestamp, abortSignal)

          expect(mockFetch.fetch).toHaveBeenCalledTimes(2)
          expect(mockEntityPersister.persistEntity).toHaveBeenCalledTimes(2)
          expect(mockEntityPersister.persistEntity).toHaveBeenNthCalledWith(1, firstSanitizedEntity)
          expect(mockEntityPersister.persistEntity).toHaveBeenNthCalledWith(2, secondSanitizedEntity)
        })

        it('should return the highest timestamp across all pages', async () => {
          const result = await component.syncProfiles(fromTimestamp, abortSignal)

          expect(result).toBe(4000)
        })
      })

      describe('and the abort signal is triggered', () => {
        let firstProfileEntity: ReturnType<typeof createValidPointerChangesResponse>
        let secondProfileEntity: ReturnType<typeof createValidPointerChangesResponse>
        let firstSanitizedEntity: ReturnType<typeof parseToEntity>

        beforeEach(() => {
          firstProfileEntity = createValidPointerChangesResponse({
            entityId: 'bafkreig3u7bhiu37wdlv5v2pk6if36xtkgqzkod35rqd7ay23prnuiphg1',
            entityTimestamp: 2000
          })
          secondProfileEntity = createValidPointerChangesResponse({
            entityId: 'bafkreig3u7bhiu37wdlv5v2pk6if36xtkgqzkod35rqd7ay23prnuiphg2',
            entityTimestamp: 3000
          })
          firstSanitizedEntity = parseToEntity(firstProfileEntity)

          ;(mockFetch.fetch as jest.Mock).mockResolvedValueOnce({
            json: jest.fn().mockResolvedValue({ deltas: [firstProfileEntity, secondProfileEntity] }),
            status: 200,
            ok: true
          })
          ;(mockEntityDeploymentTracker.hasBeenProcessed as jest.Mock).mockReturnValue(false)
          ;(mockProfileSanitizer.sanitizeProfiles as jest.Mock).mockImplementation(async () => {
            abortController.abort()
            return [firstSanitizedEntity]
          })
        })

        it('should stop processing and return the last processed timestamp', async () => {
          const result = await component.syncProfiles(fromTimestamp, abortSignal)

          expect(mockEntityPersister.persistEntity).toHaveBeenCalledTimes(1)
          expect(result).toBe(2000)
        })
      })
    })
  })
})
