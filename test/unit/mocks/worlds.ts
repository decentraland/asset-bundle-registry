import { IWorldsComponent } from '../../../src/types'

export function createWorldsMockComponent(): jest.Mocked<IWorldsComponent> {
  return {
    getWorld: jest.fn(),
    isWorldDeployment: jest.fn()
  }
}
