import { ICoordinatesComponent } from '../../../src/logic/coordinates'
import { WorldManifest } from '../../../src/logic/coordinates/types'

export function createCoordinatesMockComponent(): jest.Mocked<ICoordinatesComponent> {
  return {
    recalculateSpawnIfNeeded: jest.fn().mockResolvedValue(undefined),
    setUserSpawnCoordinate: jest.fn().mockResolvedValue(undefined),
    getWorldManifest: jest.fn().mockResolvedValue({
      occupied: [],
      spawn_coordinate: { x: '0', y: '0' },
      total: 0
    } as WorldManifest)
  }
}
