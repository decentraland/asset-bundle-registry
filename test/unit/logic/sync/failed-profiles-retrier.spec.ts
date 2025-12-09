import { ILoggerComponent } from '@well-known-components/interfaces'
import { createDbMockComponent } from '../../mocks/db'
import { createLogMockComponent } from '../../mocks/logs'
import {
  IDbComponent,
  IEntityPersisterComponent,
  IFailedProfilesRetrierComponent,
  IProfileSanitizerComponent,
  Sync
} from '../../../../src/types'
import { createProfileSanitizerMockComponent } from '../../mocks/profile-sanitizer'
import { createEntityPersisterMockComponent } from '../../mocks/entity-persister'
import { createFailedProfilesRetrierComponent } from '../../../../src/logic/sync/failed-profiles-retrier'
import { createFailedProfileDbEntity, createProfileEntity } from '../../mocks/data/profiles'
import { Entity } from '@dcl/schemas'

describe('failed profiles retrier', () => {
  let abortController: AbortController
  let abortSignal: AbortSignal

  let mockLogs: ILoggerComponent
  let mockDb: IDbComponent
  let mockProfileSanitizer: IProfileSanitizerComponent
  let mockEntityPersister: IEntityPersisterComponent
  let component: IFailedProfilesRetrierComponent

  beforeEach(() => {
    abortController = new AbortController()
    abortSignal = abortController.signal
    mockLogs = createLogMockComponent()
    mockDb = createDbMockComponent()
    mockProfileSanitizer = createProfileSanitizerMockComponent()
    mockEntityPersister = createEntityPersisterMockComponent()
    component = createFailedProfilesRetrierComponent({
      logs: mockLogs,
      db: mockDb,
      profileSanitizer: mockProfileSanitizer,
      entityPersister: mockEntityPersister
    })
  })

  describe('when signal is aborted', () => {
    beforeEach(() => {
      abortController.abort()
    })

    afterEach(() => {
      abortController = new AbortController()
      abortSignal = abortController.signal
    })

    it('should not call the profile sanitizer', async () => {
      await component.retryFailedProfiles(abortSignal)
      expect(mockProfileSanitizer.sanitizeProfiles).not.toHaveBeenCalled()
    })

    it('should not call the entity persister', async () => {
      await component.retryFailedProfiles(abortSignal)
      expect(mockEntityPersister.persistEntity).not.toHaveBeenCalled()
    })

    it('should not call the database to delete failed profile fetches', async () => {
      await component.retryFailedProfiles(abortSignal)
      expect(mockDb.deleteFailedProfileFetch).not.toHaveBeenCalled()
    })

    it('should not call the database to insert failed profile fetches', async () => {
      await component.retryFailedProfiles(abortSignal)
      expect(mockDb.insertFailedProfileFetch).not.toHaveBeenCalled()
    })

    it('should not call the database to get failed profile fetches', async () => {
      await component.retryFailedProfiles(abortSignal)
      expect(mockDb.getFailedProfileFetches).not.toHaveBeenCalled()
    })
  })

  describe('when there are no failed profiles stored in the database', () => {
    beforeEach(() => {
      mockDb.getFailedProfileFetches = jest.fn().mockResolvedValueOnce([])
    })

    it('should not call the profile sanitizer', async () => {
      await component.retryFailedProfiles(abortSignal)
      expect(mockProfileSanitizer.sanitizeProfiles).not.toHaveBeenCalled()
    })

    it('should not call the entity persister', async () => {
      await component.retryFailedProfiles(abortSignal)
      expect(mockEntityPersister.persistEntity).not.toHaveBeenCalled()
    })

    it('should not call the database to delete failed profile fetches', async () => {
      await component.retryFailedProfiles(abortSignal)
      expect(mockDb.deleteFailedProfileFetch).not.toHaveBeenCalled()
    })

    it('should not call insertFailedProfileFetch from database', async () => {
      await component.retryFailedProfiles(abortSignal)
      expect(mockDb.insertFailedProfileFetch).not.toHaveBeenCalled()
    })
  })

  describe('when there are failed profiles stored in the database', () => {
    let failedProfilesStored: Sync.FailedProfileDbEntity[]

    beforeEach(() => {
      failedProfilesStored = [createFailedProfileDbEntity()]
      mockDb.getFailedProfileFetches = jest.fn().mockResolvedValueOnce(failedProfilesStored)
    })

    it('should call the profile sanitizer', async () => {
      await component.retryFailedProfiles(abortSignal)
      expect(mockProfileSanitizer.sanitizeProfiles).toHaveBeenCalled()
    })

    describe('and the profile sanitizer correctly fetches the profile', () => {
      let fetchedProfiles: Entity[]

      beforeEach(() => {
        fetchedProfiles = [createProfileEntity()]
        mockProfileSanitizer.sanitizeProfiles = jest.fn().mockResolvedValueOnce(fetchedProfiles)
      })

      it('should call the entity persister with the fetched profiles', async () => {
        await component.retryFailedProfiles(abortSignal)
        expect(mockEntityPersister.persistEntity).toHaveBeenCalledWith(fetchedProfiles[0])
      })

      it('should call the database to delete failed profile fetches with the fetched profiles', async () => {
        await component.retryFailedProfiles(abortSignal)
        expect(mockDb.deleteFailedProfileFetch).toHaveBeenCalledWith(fetchedProfiles[0].id)
      })
    })
  })
})
