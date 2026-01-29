/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * This migration updates all deployed world registries to have only their parcels
 * (coordinates like "-53,71" or "100,-50") as pointers.
 *
 * World entities may have had world-prefixed pointers stored, but they should only
 * have coordinate-based pointers matching the pattern: -?\d+,-?\d+
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  // Update pointers for all world registries (those with worldConfiguration.name set)
  // Set pointers from metadata.scene.parcels array
  pgm.sql(`
    UPDATE registries
    SET pointers = (
      SELECT COALESCE(
        array_agg(LOWER(parcel::text)),
        ARRAY[]::varchar(255)[]
      )
      FROM jsonb_array_elements_text(metadata->'scene'->'parcels') AS parcel
    )
    WHERE metadata->'worldConfiguration'->>'name' IS NOT NULL
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Restore pointers for world registries by setting them to an array with the world's name
  pgm.sql(`
    UPDATE registries
    SET pointers = ARRAY[metadata->'worldConfiguration'->>'name']::varchar(255)[]
    WHERE metadata->'worldConfiguration'->>'name' IS NOT NULL
  `)
}
