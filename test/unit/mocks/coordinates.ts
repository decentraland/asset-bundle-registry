import { ICoordinatesComponent } from '../../../src/logic/coordinates'
import { Coordinate, WorldManifest } from '../../../src/logic/coordinates/types'

export function createCoordinatesMockComponent(): jest.Mocked<ICoordinatesComponent> {
  return {
    recalculateSpawnIfNeeded: jest.fn().mockResolvedValue(undefined),
    setUserSpawnCoordinate: jest.fn().mockResolvedValue(undefined),
    getWorldManifest: jest.fn().mockResolvedValue({
      occupied: [],
      spawn_coordinate: { x: '0', y: '0' },
      total: 0
    } as WorldManifest),
    parseCoordinate: jest.fn().mockImplementation((coord: string): Coordinate => {
      const [x, y] = coord.split(',').map((n) => parseInt(n, 10))
      return { x, y }
    }),
    formatCoordinate: jest.fn().mockImplementation((coord: Coordinate): string => {
      return `${coord.x},${coord.y}`
    }),
    calculateCenter: jest.fn().mockImplementation((parcels: string[]): Coordinate => {
      if (parcels.length === 0) {
        return { x: 0, y: 0 }
      }
      const coords = parcels.map((p) => {
        const [x, y] = p.split(',').map((n) => parseInt(n, 10))
        return { x, y }
      })
      const sumX = coords.reduce((acc, c) => acc + c.x, 0)
      const sumY = coords.reduce((acc, c) => acc + c.y, 0)
      return {
        x: Math.round(sumX / coords.length),
        y: Math.round(sumY / coords.length)
      }
    }),
    isCoordinateInParcels: jest.fn().mockImplementation((coord: Coordinate, parcels: string[]): boolean => {
      const coordStr = `${coord.x},${coord.y}`.toLowerCase()
      return parcels.some((p) => p.toLowerCase() === coordStr)
    })
  }
}
