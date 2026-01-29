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
  // Filter the pointers array to only keep coordinate-like values
  // Using a regex pattern that matches Genesis City coordinates: -?\d+,-?\d+
  pgm.sql(`
    UPDATE registries
    SET pointers = (
      SELECT COALESCE(
        array_agg(LOWER(pointer)),
        ARRAY[]::varchar(255)[]
      )
      FROM unnest(pointers) AS pointer
      WHERE pointer ~ '^-?\\d+,-?\\d+$'
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
