import { AppComponents } from '../../types'
import { Coordinate, SpawnCoordinate, WorldManifest } from './types'

export interface ICoordinatesComponent {
  /**
   * Recalculates the spawn coordinate for a world if needed.
   * - If no spawn exists: calculates center and sets it
   * - If spawn exists and is NOT user-set: recalculates center
   * - If spawn exists and IS user-set: keeps it if still valid, otherwise recalculates
   */
  recalculateSpawnIfNeeded(worldName: string): Promise<void>

  /**
   * Sets a user-specified spawn coordinate for a world.
   * Stores with is_user_set = true.
   */
  setUserSpawnCoordinate(worldName: string, coordinate: Coordinate): Promise<void>

  /**
   * Gets the world manifest including occupied parcels and spawn coordinate.
   */
  getWorldManifest(worldName: string): Promise<WorldManifest>
}

/**
 * Parses a coordinate string "x,y" into a Coordinate object.
 * @param coord - The coordinate string (e.g., "-53,71")
 * @returns The parsed coordinate
 */
export function parseCoordinate(coord: string): Coordinate {
  const [x, y] = coord.split(',').map((n) => parseInt(n, 10))
  return { x, y }
}

/**
 * Formats a Coordinate object into a string "x,y".
 * @param coord - The coordinate object
 * @returns The formatted string (e.g., "-53,71")
 */
export function formatCoordinate(coord: Coordinate): string {
  return `${coord.x},${coord.y}`
}

/**
 * Calculates the geometric center of a set of parcels.
 * Returns the parcel closest to the centroid that is actually in the set.
 * @param parcels - Array of parcel strings in "x,y" format
 * @returns The center coordinate (or {0, 0} if parcels is empty)
 */
export function calculateCenter(parcels: string[]): Coordinate {
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
 * @param coord - The coordinate to check
 * @param parcels - Array of parcel strings in "x,y" format
 * @returns True if the coordinate is in the parcels set
 */
export function isCoordinateInParcels(coord: Coordinate, parcels: string[]): boolean {
  const coordStr = formatCoordinate(coord).toLowerCase()
  return parcels.some((p) => p.toLowerCase() === coordStr)
}

/**
 * Creates the Coordinates component for managing world spawn coordinates.
 */
export function createCoordinatesComponent({ db, logs }: Pick<AppComponents, 'db' | 'logs'>): ICoordinatesComponent {
  const logger = logs.getLogger('coordinates')

  async function recalculateSpawnIfNeeded(worldName: string): Promise<void> {
    const normalizedWorldName = worldName.toLowerCase()

    // Get the current world shape (only COMPLETE/FALLBACK registries)
    const parcels = await db.getProcessedWorldParcels(normalizedWorldName)

    // If the world is empty, clear the spawn coordinate
    if (parcels.length === 0) {
      logger.info('World has no processed scenes, clearing spawn coordinate', { worldName: normalizedWorldName })
      await db.deleteSpawnCoordinate(normalizedWorldName)
      return
    }

    // Get the current spawn coordinate
    const currentSpawn = await db.getSpawnCoordinate(normalizedWorldName)

    // If no spawn exists, calculate center and set it
    if (!currentSpawn) {
      const center = calculateCenter(parcels)
      logger.info('No spawn coordinate exists, setting center', {
        worldName: normalizedWorldName,
        center: formatCoordinate(center)
      })
      await db.upsertSpawnCoordinate(normalizedWorldName, center.x, center.y, false)
      return
    }

    // If spawn exists and is NOT user-set, recalculate center
    if (!currentSpawn.isUserSet) {
      const center = calculateCenter(parcels)
      logger.info('Recalculating center for non-user-set spawn', {
        worldName: normalizedWorldName,
        oldSpawn: `${currentSpawn.x},${currentSpawn.y}`,
        newCenter: formatCoordinate(center)
      })
      await db.upsertSpawnCoordinate(normalizedWorldName, center.x, center.y, false)
      return
    }

    // If spawn exists and IS user-set, keep it if still valid
    const currentCoord: Coordinate = { x: currentSpawn.x, y: currentSpawn.y }
    if (isCoordinateInParcels(currentCoord, parcels)) {
      logger.debug('User-set spawn coordinate is still valid', {
        worldName: normalizedWorldName,
        spawn: formatCoordinate(currentCoord)
      })
      return
    }

    // User-set spawn is no longer valid, recalculate center
    const center = calculateCenter(parcels)
    logger.info('User-set spawn coordinate is no longer valid, recalculating center', {
      worldName: normalizedWorldName,
      oldSpawn: formatCoordinate(currentCoord),
      newCenter: formatCoordinate(center)
    })
    await db.upsertSpawnCoordinate(normalizedWorldName, center.x, center.y, false)
  }

  async function setUserSpawnCoordinate(worldName: string, coordinate: Coordinate): Promise<void> {
    const normalizedWorldName = worldName.toLowerCase()

    // Get the current world shape to check validity
    const parcels = await db.getProcessedWorldParcels(normalizedWorldName)

    if (parcels.length === 0 || !isCoordinateInParcels(coordinate, parcels)) {
      logger.warn('Setting user spawn coordinate that is not in current world shape', {
        worldName: normalizedWorldName,
        coordinate: formatCoordinate(coordinate),
        parcelsCount: parcels.length
      })
    }

    logger.info('Setting user spawn coordinate', {
      worldName: normalizedWorldName,
      coordinate: formatCoordinate(coordinate)
    })
    await db.upsertSpawnCoordinate(normalizedWorldName, coordinate.x, coordinate.y, true)
  }

  async function getWorldManifest(worldName: string): Promise<WorldManifest> {
    const normalizedWorldName = worldName.toLowerCase()

    // Get occupied parcels (only COMPLETE/FALLBACK registries)
    const parcels = await db.getProcessedWorldParcels(normalizedWorldName)

    // Get spawn coordinate
    let spawnCoordinate: Coordinate
    const storedSpawn = await db.getSpawnCoordinate(normalizedWorldName)

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
        x: String(spawnCoordinate.x),
        y: String(spawnCoordinate.y)
      },
      total: parcels.length
    }
  }

  return {
    recalculateSpawnIfNeeded,
    setUserSpawnCoordinate,
    getWorldManifest
  }
}
