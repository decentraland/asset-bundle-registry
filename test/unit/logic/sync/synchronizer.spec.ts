import { IBaseComponent, IConfigComponent, ILoggerComponent } from '@well-known-components/interfaces'
import {
  ICacheStorage,
  IDbComponent,
  IEntityPersisterComponent,
  IFailedProfilesRetrierComponent,
  IProfilesSynchronizerComponent,
  ISynchronizerComponent
} from '../../../../src/types'
import { createConfigMockComponent } from '../../mocks/config'
import { createLogMockComponent } from '../../mocks/logs'
import { createDbMockComponent } from '../../mocks/db'
import { createEntityPersisterMockComponent } from '../../mocks/entity-persister'
import { createMemoryStorageMockComponent } from '../../mocks/memory-storage'
import { createSnapshotsHandlerMockComponent } from '../../mocks/snapshots-handler'
import { createPointerChangesHandlerMockComponent } from '../../mocks/pointer-changes-handler'
import { createFailedProfilesRetrierMockComponent } from '../../mocks/failed-profiles-retrier'
import { createSynchronizerComponent, GENESIS_TIMESTAMP, SYNC_STATE_KEY } from '../../../../src/logic/sync/synchronizer'

function createStartOptions(): IBaseComponent.ComponentStartOptions {
  return {
    started: () => true,
    live: () => true,
    getComponents: () => ({})
  }
}

describe('synchronizer', () => {
  let mockConfig: IConfigComponent
  let mockLogs: ILoggerComponent
  let mockDb: IDbComponent
  let mockEntityPersister: IEntityPersisterComponent
  let mockMemoryStorage: ICacheStorage
  let mockSnapshotsHandler: IProfilesSynchronizerComponent
  let mockPointerChangesHandler: IProfilesSynchronizerComponent
  let mockFailedProfilesRetrier: IFailedProfilesRetrierComponent
  let component: ISynchronizerComponent

  beforeEach(async () => {
    jest.useFakeTimers()

    mockConfig = createConfigMockComponent()
    mockLogs = createLogMockComponent()
    mockDb = createDbMockComponent()
    mockEntityPersister = createEntityPersisterMockComponent()
    mockMemoryStorage = createMemoryStorageMockComponent()
    mockSnapshotsHandler = createSnapshotsHandlerMockComponent()
    mockPointerChangesHandler = createPointerChangesHandlerMockComponent()
    mockFailedProfilesRetrier = createFailedProfilesRetrierMockComponent()
  })

  afterEach(async () => {
    if (component) {
      await component.stop()
    }
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  describe('start', () => {
    describe('when profile sync is disabled', () => {
      beforeEach(async () => {
        ;(mockConfig.getString as jest.Mock).mockImplementation(async (key: string) => {
          if (key === 'DISABLE_PROFILE_SYNC') return 'true'
          return undefined
        })

        component = await createSynchronizerComponent({
          logs: mockLogs,
          config: mockConfig,
          entityPersister: mockEntityPersister,
          memoryStorage: mockMemoryStorage,
          db: mockDb,
          snapshotsHandler: mockSnapshotsHandler,
          pointerChangesHandler: mockPointerChangesHandler,
          failedProfilesRetrier: mockFailedProfilesRetrier
        })
      })

      it('should not start the synchronizer', async () => {
        await component.start(createStartOptions())

        expect(mockDb.getLatestProfileTimestamp).not.toHaveBeenCalled()
        expect(mockMemoryStorage.get).not.toHaveBeenCalled()
      })
    })

    describe('when profile sync is enabled', () => {
      beforeEach(async () => {
        ;(mockConfig.getString as jest.Mock).mockResolvedValue(undefined)
        ;(mockDb.getLatestProfileTimestamp as jest.Mock).mockResolvedValue(null)
        ;(mockMemoryStorage.get as jest.Mock).mockResolvedValue(undefined)
        ;(mockPointerChangesHandler.syncProfiles as jest.Mock).mockResolvedValue(GENESIS_TIMESTAMP)
        ;(mockFailedProfilesRetrier.retryFailedProfiles as jest.Mock).mockResolvedValue(undefined)

        component = await createSynchronizerComponent({
          logs: mockLogs,
          config: mockConfig,
          entityPersister: mockEntityPersister,
          memoryStorage: mockMemoryStorage,
          db: mockDb,
          snapshotsHandler: mockSnapshotsHandler,
          pointerChangesHandler: mockPointerChangesHandler,
          failedProfilesRetrier: mockFailedProfilesRetrier
        })
      })

      describe('and cursor is stored in memory', () => {
        let memoryCursor: number

        beforeEach(() => {
          memoryCursor = Date.now() - 1000
          ;(mockMemoryStorage.get as jest.Mock).mockResolvedValueOnce([memoryCursor])
        })

        it('should load cursor from memory and start sync', async () => {
          await component.start(createStartOptions())
          await jest.advanceTimersByTimeAsync(100)

          expect(mockMemoryStorage.get).toHaveBeenCalledWith(SYNC_STATE_KEY)
          expect(mockPointerChangesHandler.syncProfiles).toHaveBeenCalledWith(memoryCursor, expect.any(AbortSignal))
        })
      })

      describe('and cursor is not in memory but exists in database', () => {
        let dbCursor: number

        beforeEach(() => {
          dbCursor = Date.now() - 2000
          ;(mockMemoryStorage.get as jest.Mock).mockResolvedValueOnce(undefined)
          ;(mockDb.getLatestProfileTimestamp as jest.Mock).mockResolvedValue(dbCursor)
        })

        it('should load cursor from database and start sync', async () => {
          await component.start(createStartOptions())
          await jest.advanceTimersByTimeAsync(100)

          expect(mockDb.getLatestProfileTimestamp).toHaveBeenCalled()
          expect(mockPointerChangesHandler.syncProfiles).toHaveBeenCalledWith(dbCursor, expect.any(AbortSignal))
        })
      })

      describe('and cursor is not stored anywhere', () => {
        beforeEach(() => {
          ;(mockMemoryStorage.get as jest.Mock).mockResolvedValueOnce(undefined)
          ;(mockDb.getLatestProfileTimestamp as jest.Mock).mockResolvedValue(null)
        })

        it('should use genesis timestamp and start sync', async () => {
          await component.start(createStartOptions())
          await jest.advanceTimersByTimeAsync(100)

          expect(mockPointerChangesHandler.syncProfiles).toHaveBeenCalledWith(
            GENESIS_TIMESTAMP,
            expect.any(AbortSignal)
          )
        })
      })
    })
  })

  describe('stop', () => {
    beforeEach(async () => {
      ;(mockConfig.getString as jest.Mock).mockResolvedValue(undefined)
      ;(mockDb.getLatestProfileTimestamp as jest.Mock).mockResolvedValue(null)
      ;(mockMemoryStorage.get as jest.Mock).mockResolvedValue(undefined)
      ;(mockPointerChangesHandler.syncProfiles as jest.Mock).mockResolvedValue(GENESIS_TIMESTAMP)
      ;(mockFailedProfilesRetrier.retryFailedProfiles as jest.Mock).mockResolvedValue(undefined)
      ;(mockEntityPersister.waitForDrain as jest.Mock).mockResolvedValue(undefined)

      component = await createSynchronizerComponent({
        logs: mockLogs,
        config: mockConfig,
        entityPersister: mockEntityPersister,
        memoryStorage: mockMemoryStorage,
        db: mockDb,
        snapshotsHandler: mockSnapshotsHandler,
        pointerChangesHandler: mockPointerChangesHandler,
        failedProfilesRetrier: mockFailedProfilesRetrier
      })
    })

    it('should wait for entity persister to drain', async () => {
      await component.start(createStartOptions())
      await jest.advanceTimersByTimeAsync(100)

      await component.stop()

      expect(mockEntityPersister.waitForDrain).toHaveBeenCalled()
    })
  })

  describe('syncProfiles behavior', () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000
    const ONE_WEEK_MS = ONE_DAY_MS * 7

    beforeEach(async () => {
      ;(mockConfig.getString as jest.Mock).mockResolvedValue(undefined)
      ;(mockEntityPersister.waitForDrain as jest.Mock).mockResolvedValue(undefined)
      ;(mockFailedProfilesRetrier.retryFailedProfiles as jest.Mock).mockResolvedValue(undefined)
    })

    describe('when cursor is older than a week', () => {
      let oldCursor: number
      let snapshotResultCursor: number

      beforeEach(async () => {
        oldCursor = Date.now() - ONE_WEEK_MS - ONE_DAY_MS
        snapshotResultCursor = Date.now() - ONE_DAY_MS
        ;(mockMemoryStorage.get as jest.Mock).mockResolvedValueOnce([oldCursor])
        ;(mockDb.getLatestProfileTimestamp as jest.Mock).mockResolvedValue(null)
        ;(mockSnapshotsHandler.syncProfiles as jest.Mock).mockResolvedValueOnce(snapshotResultCursor)
        ;(mockPointerChangesHandler.syncProfiles as jest.Mock).mockResolvedValue(snapshotResultCursor)

        component = await createSynchronizerComponent({
          logs: mockLogs,
          config: mockConfig,
          entityPersister: mockEntityPersister,
          memoryStorage: mockMemoryStorage,
          db: mockDb,
          snapshotsHandler: mockSnapshotsHandler,
          pointerChangesHandler: mockPointerChangesHandler,
          failedProfilesRetrier: mockFailedProfilesRetrier
        })
      })

      it('should process snapshots first', async () => {
        await component.start(createStartOptions())
        await jest.advanceTimersByTimeAsync(100)

        expect(mockSnapshotsHandler.syncProfiles).toHaveBeenCalledWith(oldCursor, expect.any(AbortSignal))
      })

      it('should start pointer-changes loop after snapshots', async () => {
        await component.start(createStartOptions())
        await jest.advanceTimersByTimeAsync(100)

        expect(mockPointerChangesHandler.syncProfiles).toHaveBeenCalledWith(
          snapshotResultCursor,
          expect.any(AbortSignal)
        )
      })

      it('should save cursor to memory after snapshots', async () => {
        await component.start(createStartOptions())
        await jest.advanceTimersByTimeAsync(100)

        expect(mockMemoryStorage.set).toHaveBeenCalledWith(SYNC_STATE_KEY, snapshotResultCursor)
      })
    })

    describe('when cursor is recent', () => {
      let recentCursor: number

      beforeEach(async () => {
        recentCursor = Date.now() - ONE_DAY_MS
        ;(mockMemoryStorage.get as jest.Mock).mockResolvedValueOnce([recentCursor])
        ;(mockDb.getLatestProfileTimestamp as jest.Mock).mockResolvedValue(null)
        ;(mockPointerChangesHandler.syncProfiles as jest.Mock).mockResolvedValue(recentCursor)

        component = await createSynchronizerComponent({
          logs: mockLogs,
          config: mockConfig,
          entityPersister: mockEntityPersister,
          memoryStorage: mockMemoryStorage,
          db: mockDb,
          snapshotsHandler: mockSnapshotsHandler,
          pointerChangesHandler: mockPointerChangesHandler,
          failedProfilesRetrier: mockFailedProfilesRetrier
        })
      })

      it('should skip snapshots and start pointer-changes loop directly', async () => {
        await component.start(createStartOptions())
        await jest.advanceTimersByTimeAsync(100)

        expect(mockSnapshotsHandler.syncProfiles).not.toHaveBeenCalled()
        expect(mockPointerChangesHandler.syncProfiles).toHaveBeenCalledWith(recentCursor, expect.any(AbortSignal))
      })
    })
  })
})
