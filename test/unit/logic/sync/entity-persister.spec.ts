import { ILoggerComponent } from '@well-known-components/interfaces'
import {
  IDbComponent,
  IEntityDeploymentTrackerComponent,
  IEntityPersisterComponent,
  IProfilesCacheComponent
} from '../../../../src/types'
import { createEntityPersisterComponent } from '../../../../src/logic/sync/entity-persister'
import { createLogMockComponent } from '../../mocks/logs'
import { createDbMockComponent } from '../../mocks/db'
import { createProfilesCacheMockComponent } from '../../mocks/profiles-cache'
import { createEntityDeploymentTrackerMockComponent } from '../../mocks/entity-deployment-tracker'
import { createProfileEntity } from '../../mocks/data/profiles'
import { Entity } from '@dcl/schemas'

describe('entity persister', () => {
  let mockLogs: ILoggerComponent
  let mockDb: IDbComponent
  let mockProfilesCache: IProfilesCacheComponent
  let mockEntityDeploymentTracker: IEntityDeploymentTrackerComponent
  let component: IEntityPersisterComponent

  beforeEach(() => {
    jest.clearAllMocks()

    mockLogs = createLogMockComponent()
    mockDb = createDbMockComponent()
    mockProfilesCache = createProfilesCacheMockComponent()
    mockEntityDeploymentTracker = createEntityDeploymentTrackerMockComponent()
    ;(mockDb.upsertProfileIfNewer as jest.Mock).mockResolvedValue(undefined)

    component = createEntityPersisterComponent({
      logs: mockLogs,
      db: mockDb,
      profilesCache: mockProfilesCache,
      entityDeploymentTracker: mockEntityDeploymentTracker
    })
  })

  describe('persistEntity', () => {
    describe('when entity is marked as duplicate by tracker', () => {
      let entity: Entity

      beforeEach(() => {
        entity = createProfileEntity({ id: 'bafz', pointers: ['0x123'] })
        ;(mockEntityDeploymentTracker.tryMarkDuplicate as jest.Mock).mockReturnValue(true)
      })

      it('should not update cache or persist to database', async () => {
        await component.persistEntity(entity)

        expect(mockEntityDeploymentTracker.tryMarkDuplicate).toHaveBeenCalledWith(entity.id)
        expect(mockProfilesCache.setIfNewer).not.toHaveBeenCalled()
        expect(mockDb.upsertProfileIfNewer).not.toHaveBeenCalled()
      })
    })

    describe('when entity is not a duplicate', () => {
      let entity: Entity

      beforeEach(() => {
        entity = createProfileEntity({ id: 'bafz', pointers: ['0x123'] })
        ;(mockEntityDeploymentTracker.tryMarkDuplicate as jest.Mock).mockReturnValue(false)
      })

      describe('and cache does not update (entity not newer)', () => {
        beforeEach(() => {
          ;(mockProfilesCache.setIfNewer as jest.Mock).mockReturnValue(false)
        })

        it('should not persist to database', async () => {
          await component.persistEntity(entity)

          expect(mockProfilesCache.setIfNewer).toHaveBeenCalledWith('0x123', entity)
          expect(mockEntityDeploymentTracker.markAsProcessed).not.toHaveBeenCalled()
          expect(mockDb.upsertProfileIfNewer).not.toHaveBeenCalled()
        })
      })

      describe('and cache updates successfully (entity is newer)', () => {
        beforeEach(() => {
          ;(mockProfilesCache.setIfNewer as jest.Mock).mockReturnValue(true)
        })

        it('should mark entity as processed in tracker', async () => {
          await component.persistEntity(entity)

          expect(mockEntityDeploymentTracker.markAsProcessed).toHaveBeenCalledWith(entity.id)
        })

        describe('and bootstrap is not complete', () => {
          it('should queue persistence to database', async () => {
            await component.persistEntity(entity)
            await component.waitForDrain()

            expect(mockDb.upsertProfileIfNewer).toHaveBeenCalledWith(
              expect.objectContaining({
                id: entity.id,
                pointer: '0x123',
                localTimestamp: expect.any(Number)
              })
            )
          })
        })

        describe('and bootstrap is complete', () => {
          beforeEach(() => {
            component.setBootstrapComplete()
          })

          it('should persist directly to database', async () => {
            await component.persistEntity(entity)

            expect(mockDb.upsertProfileIfNewer).toHaveBeenCalledWith(
              expect.objectContaining({
                id: entity.id,
                pointer: '0x123',
                localTimestamp: expect.any(Number)
              })
            )
          })

          describe('and database persistence fails', () => {
            beforeEach(() => {
              ;(mockDb.upsertProfileIfNewer as jest.Mock).mockRejectedValue(new Error('DB error'))
            })

            it('should not throw', async () => {
              await expect(component.persistEntity(entity)).resolves.not.toThrow()
            })
          })
        })
      })
    })
  })

  describe('setBootstrapComplete', () => {
    it('should change bootstrap status to complete', () => {
      expect(component.isBootstrapComplete()).toBe(false)

      component.setBootstrapComplete()

      expect(component.isBootstrapComplete()).toBe(true)
    })
  })

  describe('isBootstrapComplete', () => {
    describe('when bootstrap has not been set as complete', () => {
      it('should return false', () => {
        expect(component.isBootstrapComplete()).toBe(false)
      })
    })

    describe('when bootstrap has been set as complete', () => {
      beforeEach(() => {
        component.setBootstrapComplete()
      })

      it('should return true', () => {
        expect(component.isBootstrapComplete()).toBe(true)
      })
    })
  })

  describe('waitForDrain', () => {
    let entity1: Entity
    let entity2: Entity

    beforeEach(() => {
      entity1 = createProfileEntity({ id: 'bafz1', pointers: ['0x111'] })
      entity2 = createProfileEntity({ id: 'bafz2', pointers: ['0x222'] })
      ;(mockEntityDeploymentTracker.tryMarkDuplicate as jest.Mock).mockReturnValue(false)
      ;(mockProfilesCache.setIfNewer as jest.Mock).mockReturnValue(true)
    })

    it('should wait for all queued operations to complete', async () => {
      await component.persistEntity(entity1)
      await component.persistEntity(entity2)
      await component.waitForDrain()

      expect(mockDb.upsertProfileIfNewer).toHaveBeenCalledTimes(2)
    })
  })
})
