/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Creates the world_spawn_coordinates table and populates default spawn coordinates
 * for all existing worlds.
 *
 * The table tracks:
 * - world_name: The world identifier (primary key, case-insensitive)
 * - x, y: The spawn coordinate
 * - is_user_set: Whether the coordinate was explicitly set by the user (vs auto-calculated)
 * - timestamp: When the coordinate was last updated
 *
 * Default data population:
 * - Uses metadata.scene.base as the spawn coordinate source
 * - Falls back to first parcel in pointers array if base is not available
 * - Only considers COMPLETE or FALLBACK registries (processed scenes)
 * - Uses DISTINCT ON to get only one entry per world (latest by timestamp)
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // Step 1: Create the table
  pgm.createTable('world_spawn_coordinates', {
    world_name: { type: 'varchar(255)', notNull: true, primaryKey: true },
    x: { type: 'integer', notNull: true },
    y: { type: 'integer', notNull: true },
    is_user_set: { type: 'boolean', notNull: true, default: false },
    timestamp: { type: 'bigint', notNull: true }
  })

  // Index for efficient lookups by world name (case-insensitive)
  pgm.createIndex('world_spawn_coordinates', 'LOWER(world_name)', {
    name: 'idx_world_spawn_coordinates_world_name_lower'
  })

  // Step 2: Populate default spawn coordinates for existing worlds
  // Uses metadata.scene.base as primary source, falls back to first pointer
  // Only processes COMPLETE or FALLBACK registries (processed scenes)
  pgm.sql(`
    INSERT INTO world_spawn_coordinates (world_name, x, y, is_user_set, timestamp)
    SELECT DISTINCT ON (LOWER(metadata->'worldConfiguration'->>'name'))
      LOWER(metadata->'worldConfiguration'->>'name') as world_name,
      SPLIT_PART(COALESCE(metadata->'scene'->>'base', pointers[1]), ',', 1)::integer as x,
      SPLIT_PART(COALESCE(metadata->'scene'->>'base', pointers[1]), ',', 2)::integer as y,
      false as is_user_set,
      EXTRACT(EPOCH FROM NOW())::bigint * 1000 as timestamp
    FROM registries
    WHERE
      metadata->'worldConfiguration'->>'name' IS NOT NULL
      AND status IN ('complete', 'fallback')
    ORDER BY LOWER(metadata->'worldConfiguration'->>'name'), timestamp DESC
    ON CONFLICT (world_name) DO NOTHING
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('world_spawn_coordinates', [], {
    name: 'idx_world_spawn_coordinates_world_name_lower',
    ifExists: true
  })
  pgm.dropTable('world_spawn_coordinates', { ifExists: true })
}
