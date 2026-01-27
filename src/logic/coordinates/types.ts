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
  spawn_coordinate: { x: string; y: string }
  total: number
}
