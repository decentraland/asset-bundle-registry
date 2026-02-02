import { ICoordinatesComponent } from '../../../src/logic/coordinates'
import { MAX_PARCEL_COORDINATE, MIN_PARCEL_COORDINATE } from '../../../src/logic/coordinates/constants'
import { Coordinate, WorldManifest } from '../../../src/logic/coordinates/types'
import { WorldBoundingRectangle } from '../../../src/types'

export function createCoordinatesMockComponent(): jest.Mocked<ICoordinatesComponent> {
  return {
    recalculateSpawnIfNeeded: jest.fn().mockResolvedValue(undefined),
    setUserSpawnCoordinate: jest.fn().mockResolvedValue(undefined),
    getWorldManifest: jest.fn().mockResolvedValue({
      occupied: [],
      spawn_coordinate: { x: 0, y: 0 },
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
    }),
    calculateCenterFromBounds: jest
      .fn()
      .mockImplementation((bounds: NonNullable<WorldBoundingRectangle>): Coordinate => {
        return {
          x: Math.round((bounds.minX + bounds.maxX) / 2),
          y: Math.round((bounds.minY + bounds.maxY) / 2)
        }
      }),
    isCoordinateInBounds: jest.fn().mockImplementation((coord: Coordinate, bounds: WorldBoundingRectangle): boolean => {
      if (!bounds) {
        return false
      }
      return coord.x >= bounds.minX && coord.x <= bounds.maxX && coord.y >= bounds.minY && coord.y <= bounds.maxY
    }),
    isBetweenParcelBounds: jest.fn().mockImplementation((value: number): boolean => {
      return value >= MIN_PARCEL_COORDINATE && value <= MAX_PARCEL_COORDINATE
    })
  }
}
