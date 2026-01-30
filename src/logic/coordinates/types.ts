import { WorldBoundingRectangle } from '../../types'

/**
 * Represents a coordinate in the world grid.
 */
export type Coordinate = {
  x: number
  y: number
}

/**
 * Represents a spawn coordinate stored in the database.
 */
export type SpawnCoordinate = {
  worldName: string
  x: number
  y: number
  isUserSet: boolean
  timestamp: number
}

/**
 * Represents the world manifest returned by the API.
 */
export type WorldManifest = {
  occupied: string[]
  spawn_coordinate: { x: number; y: number }
  total: number
}

export interface ICoordinatesComponent {
  /**
   * Recalculates the spawn coordinate for a world if needed.
   * Only updates if the event timestamp is newer than the existing spawn coordinate.
   * - If no spawn exists: calculates center and sets it
   * - If spawn exists and is NOT user-set: recalculates center
   * - If spawn exists and IS user-set: keeps it if still valid, otherwise recalculates
   *
   * @param worldName - The world name
   * @param eventTimestamp - The timestamp of the event that triggered this recalculation
   */
  recalculateSpawnIfNeeded(worldName: string, eventTimestamp: number): Promise<void>

  /**
   * Sets a user-specified spawn coordinate for a world.
   * Only updates if the event timestamp is newer than the existing spawn coordinate.
   * Stores with is_user_set = true.
   *
   * @param worldName - The world name
   * @param coordinate - The spawn coordinate
   * @param eventTimestamp - The timestamp of the event that triggered this update
   */
  setUserSpawnCoordinate(worldName: string, coordinate: Coordinate, eventTimestamp: number): Promise<void>

  /**
   * Gets the world manifest including occupied parcels and spawn coordinate.
   */
  getWorldManifest(worldName: string): Promise<WorldManifest>

  /**
   * Parses a coordinate string "x,y" into a Coordinate object.
   */
  parseCoordinate(coord: string): Coordinate

  /**
   * Formats a Coordinate object into a string "x,y".
   */
  formatCoordinate(coord: Coordinate): string

  /**
   * Calculates the geometric center of a set of parcels.
   * Returns the parcel closest to the centroid that is actually in the set.
   */
  calculateCenter(parcels: string[]): Coordinate

  /**
   * Checks if a coordinate is within a set of parcels.
   */
  isCoordinateInParcels(coord: Coordinate, parcels: string[]): boolean

  /**
   * Calculates the center coordinate from a bounding rectangle.
   * Returns the geometric center rounded to the nearest integer.
   */
  calculateCenterFromBounds(bounds: NonNullable<WorldBoundingRectangle>): Coordinate

  /**
   * Checks if a coordinate is within a bounding rectangle.
   * Note: This is a quick check that may return true for coordinates not actually in the world
   * (e.g., if the world has an L-shape), but false positives are acceptable for logging purposes.
   */
  isCoordinateInBounds(coord: Coordinate, bounds: WorldBoundingRectangle): boolean
}
