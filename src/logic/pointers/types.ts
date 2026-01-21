/**
 * World Scene Pointer Types
 *
 * World scenes use a prefixed pointer format: `worldname:coordinate`
 * Examples:
 *   - `myworld.dcl.eth:0,0` - Scene at (0,0) in myworld.dcl.eth
 *   - `myworld.dcl.eth:-5,10` - Scene at (-5,10) in myworld.dcl.eth
 *
 * Regular Genesis City scenes use plain coordinates:
 *   - `-53,71` - Scene at (-53,71) in Genesis City
 *
 * For backward compatibility, world names without coordinates (e.g., `myworld.dcl.eth`)
 * are treated as legacy world pointers pointing to the main world entity.
 */

export type ParsedWorldScenePointer = {
  type: 'world-scene'
  worldName: string
  coordinates: string
}

export type ParsedLegacyWorldPointer = {
  type: 'legacy-world'
  worldName: string
}

export type ParsedGenesisPointer = {
  type: 'genesis'
  coordinates: string
}

export type ParsedPointer = ParsedWorldScenePointer | ParsedLegacyWorldPointer | ParsedGenesisPointer

export interface IPointersComponent {
  /** Constructs a world scene pointer from world name and coordinates */
  toWorldScenePointer(worldName: string, coordinates: string): string
  /** Converts an array of coordinates to world scene pointers for a given world */
  toWorldScenePointers(worldName: string, coordinates: string[]): string[]
  /** Checks if a pointer is a world scene pointer (has worldname:coordinates format) */
  isWorldScenePointer(pointer: string): boolean
  /** Checks if a pointer is a legacy world pointer (just the world name, no coordinates) */
  isLegacyWorldPointer(pointer: string): boolean
  /** Parses a pointer to determine its type and extract components */
  parsePointer(pointer: string): ParsedPointer
  /** Extracts the world name from a pointer if it's a world-related pointer */
  extractWorldName(pointer: string): string | null
  /** Extracts coordinates from a pointer */
  extractCoordinates(pointer: string): string | null
  /**
   * Transforms entity pointers to world-prefixed format if they are coordinates.
   * For multi-scene worlds, pointers like ["0,0", "1,0"] become ["worldname:0,0", "worldname:1,0"]
   * For single-scene worlds or legacy worlds, returns just the world name as pointer.
   */
  transformWorldPointers(worldName: string, entityPointers: string[]): string[]
}
