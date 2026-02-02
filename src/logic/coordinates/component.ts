import { AppComponents, SpawnRecalculationParams, SpawnRecalculationResult, WorldBoundingRectangle } from '../../types'
import { MAX_PARCEL_COORDINATE, MIN_PARCEL_COORDINATE } from './constants'
import { Coordinate, ICoordinatesComponent, WorldManifest } from './types'

/**
 * Creates the Coordinates component for managing world spawn coordinates.
 */
export function createCoordinatesComponent({ db, logs }: Pick<AppComponents, 'db' | 'logs'>): ICoordinatesComponent {
  const logger = logs.getLogger('coordinates')

  /**
   * Parses a coordinate string "x,y" into a Coordinate object.
   */
  function parseCoordinate(coord: string): Coordinate {
    const parts = coord.split(',')
    if (parts.length !== 2) {
      throw new Error(`Invalid coordinate format: ${coord}`)
    }

    const x = parseInt(parts[0], 10)
    const y = parseInt(parts[1], 10)

    if (isNaN(x) || isNaN(y)) {
      throw new Error(`Invalid coordinate values: ${coord}`)
    }

    if (x < MIN_PARCEL_COORDINATE || x > MAX_PARCEL_COORDINATE) {
      throw new Error(
        `Coordinate X value ${x} is out of bounds. Must be between ${MIN_PARCEL_COORDINATE} and ${MAX_PARCEL_COORDINATE}.`
      )
    }

    if (y < MIN_PARCEL_COORDINATE || y > MAX_PARCEL_COORDINATE) {
      throw new Error(
        `Coordinate Y value ${y} is out of bounds. Must be between ${MIN_PARCEL_COORDINATE} and ${MAX_PARCEL_COORDINATE}.`
      )
    }

    return { x, y }
  }

  /**
   * Formats a Coordinate object into a string "x,y".
   */
  function formatCoordinate(coord: Coordinate): string {
    return `${coord.x},${coord.y}`
  }

  /**
   * Calculates the geometric center of a set of parcels.
   * Returns the parcel closest to the centroid that is actually in the set.
   */
  function calculateCenter(parcels: string[]): Coordinate {
    if (parcels.length === 0) {
      return { x: 0, y: 0 }
    }

    // Calculate centroid
    const coords = parcels.map(parseCoordinate)
    const sumX = coords.reduce((acc, c) => acc + c.x, 0)
    const sumY = coords.reduce((acc, c) => acc + c.y, 0)
    const centroidX = sumX / coords.length
    const centroidY = sumY / coords.length

    // Find the parcel closest to the centroid that is actually in the set
    let minDistance = Infinity
    let closest: Coordinate = coords[0]

    for (const coord of coords) {
      const distance = Math.pow(coord.x - centroidX, 2) + Math.pow(coord.y - centroidY, 2)
      if (distance < minDistance) {
        minDistance = distance
        closest = coord
      }
    }

    return closest
  }

  /**
   * Checks if a coordinate is within a set of parcels.
   */
  function isCoordinateInParcels(coord: Coordinate, parcels: string[]): boolean {
    const coordStr = formatCoordinate(coord).toLowerCase()
    return parcels.some((p) => p.toLowerCase() === coordStr)
  }

  /**
   * Checks if a coordinate is within a bounding rectangle.
   * Note: This is a quick check that may return true for coordinates not actually in the world
   * (e.g., if the world has an L-shape), but false positives are acceptable for logging purposes.
   */
  function isCoordinateInBounds(coord: Coordinate, bounds: WorldBoundingRectangle): boolean {
    if (!bounds) {
      return false
    }
    return coord.x >= bounds.minX && coord.x <= bounds.maxX && coord.y >= bounds.minY && coord.y <= bounds.maxY
  }

  /**
   * Calculates the center coordinate from a bounding rectangle.
   * Returns the geometric center rounded to the nearest integer.
   */
  function calculateCenterFromBounds(bounds: NonNullable<WorldBoundingRectangle>): Coordinate {
    return {
      x: Math.round((bounds.minX + bounds.maxX) / 2),
      y: Math.round((bounds.minY + bounds.maxY) / 2)
    }
  }

  /**
   * Pure function that calculates the spawn action based on current world state.
   * Used by both recalculateSpawnIfNeeded (via DB atomic operation) and can be tested independently.
   */
  function calculateSpawnAction(params: SpawnRecalculationParams): SpawnRecalculationResult {
    const { boundingRectangle, currentSpawn } = params

    // If the world has no processed scenes, delete the spawn coordinate
    if (!boundingRectangle) {
      return { action: 'delete' }
    }

    // If no spawn exists, calculate center from bounds and set it
    if (!currentSpawn) {
      const center = calculateCenterFromBounds(boundingRectangle)
      return { action: 'upsert', x: center.x, y: center.y, isUserSet: false }
    }

    const currentCoord: Coordinate = { x: currentSpawn.x, y: currentSpawn.y }

    // If spawn exists and is NOT user-set, recalculate center from bounds
    if (!currentSpawn.isUserSet) {
      const center = calculateCenterFromBounds(boundingRectangle)
      return { action: 'upsert', x: center.x, y: center.y, isUserSet: false }
    }

    // If spawn exists and IS user-set, keep it if still within bounds
    if (isCoordinateInBounds(currentCoord, boundingRectangle)) {
      return { action: 'none' }
    }

    // User-set spawn is no longer within bounds, recalculate center
    const center = calculateCenterFromBounds(boundingRectangle)
    return { action: 'upsert', x: center.x, y: center.y, isUserSet: false }
  }

  async function recalculateSpawnIfNeeded(worldName: string, eventTimestamp: number): Promise<void> {
    const normalizedWorldName = worldName.toLowerCase()

    // Use atomic DB operation with timestamp-based conflict resolution
    await db.recalculateSpawnCoordinate(normalizedWorldName, eventTimestamp, (params) => {
      const result = calculateSpawnAction(params)

      // Log based on the action
      if (result.action === 'delete') {
        logger.info('World has no processed scenes, clearing spawn coordinate', {
          worldName: normalizedWorldName,
          eventTimestamp
        })
      } else if (result.action === 'upsert') {
        const newCenter = formatCoordinate({ x: result.x!, y: result.y! })
        if (!params.currentSpawn) {
          logger.info('No spawn coordinate exists, setting center', {
            worldName: normalizedWorldName,
            center: newCenter,
            eventTimestamp
          })
        } else if (!params.currentSpawn.isUserSet) {
          logger.info('Recalculating center for non-user-set spawn', {
            worldName: normalizedWorldName,
            oldSpawn: `${params.currentSpawn.x},${params.currentSpawn.y}`,
            newCenter,
            eventTimestamp
          })
        } else {
          logger.info('User-set spawn coordinate is outside world bounds, recalculating center', {
            worldName: normalizedWorldName,
            oldSpawn: `${params.currentSpawn.x},${params.currentSpawn.y}`,
            newCenter,
            eventTimestamp
          })
        }
      } else {
        // action === 'none'
        logger.debug('User-set spawn coordinate is still within bounds', {
          worldName: normalizedWorldName,
          spawn: `${params.currentSpawn!.x},${params.currentSpawn!.y}`,
          eventTimestamp
        })
      }

      return result
    })
  }

  async function setUserSpawnCoordinate(
    worldName: string,
    coordinate: Coordinate,
    eventTimestamp: number
  ): Promise<void> {
    const normalizedWorldName = worldName.toLowerCase()

    // Set the spawn coordinate atomically with timestamp-based conflict resolution
    const { boundingRectangle, updated } = await db.setSpawnCoordinate(
      normalizedWorldName,
      coordinate.x,
      coordinate.y,
      true,
      eventTimestamp
    )

    if (!updated) {
      logger.info('User spawn coordinate update skipped - newer timestamp exists', {
        worldName: normalizedWorldName,
        coordinate: formatCoordinate(coordinate),
        eventTimestamp
      })
      return
    }

    // Log with bounding rectangle info
    const isWithinBounds = isCoordinateInBounds(coordinate, boundingRectangle)
    if (!boundingRectangle || !isWithinBounds) {
      logger.warn('User spawn coordinate set outside current world bounds', {
        worldName: normalizedWorldName,
        coordinate: formatCoordinate(coordinate),
        boundingRectangle: boundingRectangle
          ? `(${boundingRectangle.minX},${boundingRectangle.minY}) to (${boundingRectangle.maxX},${boundingRectangle.maxY})`
          : 'none',
        eventTimestamp
      })
    } else {
      logger.info('User spawn coordinate set', {
        worldName: normalizedWorldName,
        coordinate: formatCoordinate(coordinate),
        eventTimestamp
      })
    }
  }

  async function getWorldManifest(worldName: string): Promise<WorldManifest> {
    const normalizedWorldName = worldName.toLowerCase()

    // Get parcels and spawn coordinate atomically
    const { parcels, spawnCoordinate: storedSpawn } = await db.getWorldManifestData(normalizedWorldName)

    // Determine spawn coordinate
    let spawnCoordinate: Coordinate
    if (storedSpawn) {
      spawnCoordinate = { x: storedSpawn.x, y: storedSpawn.y }
    } else if (parcels.length > 0) {
      // Calculate center but don't persist
      spawnCoordinate = calculateCenter(parcels)
    } else {
      // No parcels, default to 0,0
      spawnCoordinate = { x: 0, y: 0 }
    }

    return {
      occupied: parcels,
      spawn_coordinate: {
        x: spawnCoordinate.x,
        y: spawnCoordinate.y
      },
      total: parcels.length
    }
  }

  return {
    recalculateSpawnIfNeeded,
    setUserSpawnCoordinate,
    getWorldManifest,
    parseCoordinate,
    formatCoordinate,
    calculateCenter,
    isCoordinateInParcels,
    calculateCenterFromBounds,
    isCoordinateInBounds
  }
}
