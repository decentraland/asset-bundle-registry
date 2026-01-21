import { IPointersComponent, ParsedPointer } from './types'

// Regular expression for Genesis City coordinates (e.g., -53,71 or 100,-50)
const GENESIS_COORDINATES_REGEX = /^-?\d+,-?\d+$/

export function createPointersComponent(): IPointersComponent {
  /**
   * Constructs a world scene pointer from world name and coordinates
   * @param worldName - The world name (e.g., "myworld.dcl.eth")
   * @param coordinates - The coordinates within the world (e.g., "0,0")
   * @returns The formatted pointer (e.g., "myworld.dcl.eth:0,0")
   */
  function toWorldScenePointer(worldName: string, coordinates: string): string {
    return `${worldName.toLowerCase()}:${coordinates}`
  }

  /**
   * Converts an array of coordinates to world scene pointers for a given world
   * @param worldName - The world name
   * @param coordinates - Array of coordinates (e.g., ["0,0", "1,0", "0,1"])
   * @returns Array of world scene pointers
   */
  function toWorldScenePointers(worldName: string, coordinates: string[]): string[] {
    return coordinates.map((coord) => toWorldScenePointer(worldName, coord))
  }

  /**
   * Checks if a pointer is a world scene pointer (has worldname:coordinates format)
   * @param pointer - The pointer to check
   * @returns true if the pointer is a world scene pointer
   */
  function isWorldScenePointer(pointer: string): boolean {
    // Must contain a colon and NOT be a plain coordinate
    if (!pointer.includes(':')) {
      return false
    }

    // If it matches Genesis coordinates pattern, it's not a world scene pointer
    if (GENESIS_COORDINATES_REGEX.test(pointer)) {
      return false
    }

    // Extract what would be the coordinates part (after last colon)
    const lastColonIndex = pointer.lastIndexOf(':')
    const potentialCoords = pointer.slice(lastColonIndex + 1)

    // The coordinates part should look like coordinates (e.g., "0,0" or "-5,10")
    return GENESIS_COORDINATES_REGEX.test(potentialCoords)
  }

  /**
   * Checks if a pointer is a legacy world pointer (just the world name, no coordinates)
   * Legacy world pointers are world names that don't have the :coordinates suffix
   * @param pointer - The pointer to check
   * @returns true if the pointer appears to be a legacy world pointer
   */
  function isLegacyWorldPointer(pointer: string): boolean {
    // Not a Genesis coordinate
    if (GENESIS_COORDINATES_REGEX.test(pointer)) {
      return false
    }

    // Not a world scene pointer (doesn't have :coordinates)
    if (isWorldScenePointer(pointer)) {
      return false
    }

    // Contains typical world name patterns (like .dcl.eth, .eth, or other TLDs)
    // This is a heuristic - world names typically have dots or specific patterns
    return pointer.includes('.') || pointer.includes('dcl')
  }

  /**
   * Parses a pointer to determine its type and extract components
   * @param pointer - The pointer to parse
   * @returns Parsed pointer information
   */
  function parsePointer(pointer: string): ParsedPointer {
    const normalizedPointer = pointer.toLowerCase()

    // Check for Genesis City coordinates first (e.g., -53,71)
    if (GENESIS_COORDINATES_REGEX.test(normalizedPointer)) {
      return {
        type: 'genesis',
        coordinates: normalizedPointer
      }
    }

    // Check for world scene pointer (worldname:coordinates)
    if (isWorldScenePointer(normalizedPointer)) {
      const lastColonIndex = normalizedPointer.lastIndexOf(':')
      return {
        type: 'world-scene',
        worldName: normalizedPointer.slice(0, lastColonIndex),
        coordinates: normalizedPointer.slice(lastColonIndex + 1)
      }
    }

    // Treat as legacy world pointer (just world name)
    return {
      type: 'legacy-world',
      worldName: normalizedPointer
    }
  }

  /**
   * Extracts the world name from a pointer if it's a world-related pointer
   * @param pointer - The pointer to extract from
   * @returns The world name or null if not a world pointer
   */
  function extractWorldName(pointer: string): string | null {
    const parsed = parsePointer(pointer)

    if (parsed.type === 'world-scene') {
      return parsed.worldName
    }

    if (parsed.type === 'legacy-world') {
      return parsed.worldName
    }

    return null
  }

  /**
   * Extracts coordinates from a pointer
   * @param pointer - The pointer to extract from
   * @returns The coordinates or null if not available
   */
  function extractCoordinates(pointer: string): string | null {
    const parsed = parsePointer(pointer)

    if (parsed.type === 'world-scene' || parsed.type === 'genesis') {
      return parsed.coordinates
    }

    return null
  }

  /**
   * Transforms entity pointers to world-prefixed format if they are coordinates.
   * For multi-scene worlds, pointers like ["0,0", "1,0"] become ["worldname:0,0", "worldname:1,0"]
   * For single-scene worlds or legacy worlds, keeps the world name as pointer.
   *
   * @param worldName - The world name from worldConfiguration
   * @param entityPointers - The original pointers from the entity
   * @returns Transformed pointers with world prefix for coordinates
   */
  function transformWorldPointers(worldName: string, entityPointers: string[]): string[] {
    const normalizedWorldName = worldName.toLowerCase()

    // Check if any pointer looks like coordinates (multi-scene world)
    const hasCoordinatePointers = entityPointers.some((p) => GENESIS_COORDINATES_REGEX.test(p))

    if (hasCoordinatePointers) {
      // Multi-scene world: transform coordinate pointers to world-prefixed format
      return entityPointers.map((pointer) => {
        if (GENESIS_COORDINATES_REGEX.test(pointer)) {
          return toWorldScenePointer(normalizedWorldName, pointer)
        }
        // If it's not a coordinate, keep as is (shouldn't happen but safe fallback)
        return pointer.toLowerCase()
      })
    }

    // Single-scene world or legacy: use world name as pointer (backward compatible)
    return [normalizedWorldName]
  }

  return {
    toWorldScenePointer,
    toWorldScenePointers,
    isWorldScenePointer,
    isLegacyWorldPointer,
    parsePointer,
    extractWorldName,
    extractCoordinates,
    transformWorldPointers
  }
}
