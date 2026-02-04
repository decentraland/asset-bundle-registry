import { AppComponents, SpawnRecalculationParams, SpawnRecalculationResult, WorldBoundingRectangle } from '../../types'
import { MAX_PARCEL_COORDINATE, MIN_PARCEL_COORDINATE } from './constants'
import { Coordinate, ICoordinatesComponent, WorldManifest } from './types'

/**
 * Creates the Coordinates component for managing world spawn coordinates.
 */
export function createCoordinatesComponent({ db, logs }: Pick<AppComponents, 'db' | 'logs'>): ICoordinatesComponent {
  const logger = logs.getLogger('coordinates')

  function isBetweenParcelBounds(value: number): boolean {
    return value >= MIN_PARCEL_COORDINATE && value <= MAX_PARCEL_COORDINATE
  }

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

    if (!isBetweenParcelBounds(x)) {
      throw new Error(
        `Coordinate X value ${x} is out of bounds. Must be between ${MIN_PARCEL_COORDINATE} and ${MAX_PARCEL_COORDINATE}.`
      )
    }

    if (!isBetweenParcelBounds(y)) {
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
   * Calculates the bounding rectangle from a set of parcels.
   * Returns null if parcels is empty.
   */
  function calculateBoundsFromParcels(parcels: string[]): WorldBoundingRectangle {
    if (parcels.length === 0) {
      return null
    }

    const coords = parcels.map(parseCoordinate)
    return {
      minX: Math.min(...coords.map((c) => c.x)),
      maxX: Math.max(...coords.map((c) => c.x)),
      minY: Math.min(...coords.map((c) => c.y)),
      maxY: Math.max(...coords.map((c) => c.y))
    }
  }

  /**
   * Pure function that calculates the spawn action based on current world state.
   * Used by both recalculateSpawnIfNeeded (via DB atomic operation) and can be tested independently.
   *
   * Logic:
   * - If no processed scenes: delete spawn coordinate
   * - If no spawn exists: use entityBaseCoordinate if provided, otherwise calculate center
   * - If spawn exists (user-set or not): keep it if within bounds, otherwise recalculate center
   */
  function calculateSpawnAction(params: SpawnRecalculationParams): SpawnRecalculationResult {
    const { boundingRectangle, currentSpawn, entityBaseCoordinate } = params

    // If the world has no processed scenes, delete the spawn coordinate
    if (!boundingRectangle) {
      return { action: 'delete' }
    }

    // If no spawn exists, set it using entityBaseCoordinate or center
    if (!currentSpawn) {
      if (entityBaseCoordinate) {
        // Use the entity's base coordinate (scene.base or first parcel)
        const coord = parseCoordinate(entityBaseCoordinate)
        return { action: 'upsert', x: coord.x, y: coord.y, isUserSet: false }
      }
      // Fallback to center if no base coordinate provided
      const center = calculateCenterFromBounds(boundingRectangle)
      return { action: 'upsert', x: center.x, y: center.y, isUserSet: false }
    }

    const currentCoord: Coordinate = { x: currentSpawn.x, y: currentSpawn.y }

    // If spawn exists (user-set or not), keep it if still within bounds
    if (isCoordinateInBounds(currentCoord, boundingRectangle)) {
      return { action: 'none' }
    }

    // Spawn is no longer within bounds, recalculate center
    const center = calculateCenterFromBounds(boundingRectangle)
    return { action: 'upsert', x: center.x, y: center.y, isUserSet: false }
  }

  async function recalculateSpawnIfNeeded(
    worldName: string,
    eventTimestamp: number,
    entityBaseCoordinate?: string | null
  ): Promise<void> {
    const normalizedWorldName = worldName.toLowerCase()

    // Use atomic DB operation with timestamp-based conflict resolution
    await db.recalculateSpawnCoordinate(normalizedWorldName, eventTimestamp, (params) => {
      // Pass entityBaseCoordinate to the calculation function
      const result = calculateSpawnAction({ ...params, entityBaseCoordinate })

      // Log based on the action
      if (result.action === 'delete') {
        logger.info('World has no processed scenes, clearing spawn coordinate', {
          worldName: normalizedWorldName,
          eventTimestamp
        })
      } else if (result.action === 'upsert') {
        if (result.x === undefined || result.y === undefined) {
          throw new Error('Spawn coordinate is undefined')
        }

        const newSpawn = formatCoordinate({ x: result.x, y: result.y })
        if (!params.currentSpawn) {
          logger.info('No spawn coordinate exists, setting spawn', {
            worldName: normalizedWorldName,
            spawn: newSpawn,
            source: entityBaseCoordinate ? 'entityBase' : 'center',
            eventTimestamp
          })
        } else {
          logger.info('Spawn coordinate is outside world bounds, recalculating center', {
            worldName: normalizedWorldName,
            oldSpawn: `${params.currentSpawn.x},${params.currentSpawn.y}`,
            newSpawn,
            wasUserSet: String(params.currentSpawn.isUserSet),
            eventTimestamp
          })
        }
      } else {
        // action === 'none'
        logger.debug('Spawn coordinate is still within bounds, keeping it', {
          worldName: normalizedWorldName,
          spawn: `${params.currentSpawn?.x},${params.currentSpawn?.y}`,
          isUserSet: String(params.currentSpawn?.isUserSet),
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

    if (!isBetweenParcelBounds(coordinate.x) || !isBetweenParcelBounds(coordinate.y)) {
      throw new Error(`Coordinate ${formatCoordinate(coordinate)} is out of bounds`)
    }

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

    if (parcels.length === 0) {
      // No parcels, default to 0,0
      spawnCoordinate = { x: 0, y: 0 }
    } else {
      const bounds = calculateBoundsFromParcels(parcels)
      const storedCoord = storedSpawn ? { x: storedSpawn.x, y: storedSpawn.y } : null

      if (storedCoord && isCoordinateInBounds(storedCoord, bounds)) {
        // Stored spawn exists and is within bounds
        spawnCoordinate = storedCoord
      } else {
        // No stored spawn or it's out of bounds, calculate center
        spawnCoordinate = calculateCenter(parcels)
      }
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
