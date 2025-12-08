import { IConfigComponent } from '@well-known-components/interfaces'
import { IEntityDeploymentTrackerComponent } from '../../../../src/types'
import { createConfigMockComponent } from '../../mocks/config'
import { createEntityDeploymentTrackerComponent } from '../../../../src/logic/sync/entity-deployment-tracker'

describe('entity deployment tracker', () => {
  let configMock: IConfigComponent
  let component: IEntityDeploymentTrackerComponent

  beforeEach(async () => {
    configMock = createConfigMockComponent()
    component = await createEntityDeploymentTrackerComponent({ config: configMock })
  })

  describe('when no entities has been processed', () => {
    let uniqueEphemeralEntityId: string

    beforeEach(() => {
      uniqueEphemeralEntityId = Date.now().toString()
    })

    it('hasBeenProcessed should return false', () => {
      const result = component.hasBeenProcessed(uniqueEphemeralEntityId)
      expect(result).toBe(false)
    })

    it('tryMarkDuplicate should return false', () => {
      const result = component.tryMarkDuplicate(uniqueEphemeralEntityId)
      expect(result).toBe(false)
    })
  })

  describe('when entities has been processed', () => {
    let processedEntityA: string
    let nonProcessedEntity: string

    beforeEach(() => {
      nonProcessedEntity = (Date.now() - 1000).toString()
      processedEntityA = Date.now().toString()
      component.markAsProcessed(processedEntityA)
    })

    it('hasBeenProcessed should return true for processed entities', () => {
      const result = component.hasBeenProcessed(processedEntityA)
      expect(result).toBe(true)
    })

    it('hasBeenProcessed should return false for non-processed entities', () => {
      const result = component.hasBeenProcessed(nonProcessedEntity)
      expect(result).toBe(false)
    })

    it('tryMarkDuplicate should return true for processed entities', () => {
      const result = component.tryMarkDuplicate(processedEntityA)
      expect(result).toBe(true)
    })

    it('tryMarkDuplicate should return false for non-processed entities', () => {
      const result = component.tryMarkDuplicate(nonProcessedEntity)
      expect(result).toBe(false)
    })
  })
})
