import { IConfigComponent, IFetchComponent, ILoggerComponent } from '@well-known-components/interfaces'
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

describe('pointer-changes handler', () => {
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

  describe('when syncing profiles', () => {
    let abortController: AbortController
    let abortSignal: AbortSignal
    let fromTimestamp: number
    let retrievedEntities: any[] // prevent typing pointer-changes response

    beforeEach(() => {
      fromTimestamp = 0
      abortController = new AbortController()
      abortSignal = abortController.signal
    })

    describe('and catalyst return profiles', () => {
      beforeEach(() => {
        retrievedEntities = [createValidPointerChangesResponse()]
        ;(mockFetch.fetch as jest.Mock).mockResolvedValue({
          json: jest.fn().mockResolvedValue({
            deltas: retrievedEntities
          }),
          status: 200,
          statusText: 'OK',
          ok: true
        })
      })

      it('should persist the profiles', async () => {
        await component.syncProfiles(fromTimestamp, abortSignal)
        expect(mockEntityPersister.persistEntity).toHaveBeenCalledWith(parseToEntity(retrievedEntities[0]))
      })
    })
  })
})
