/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Partial GIN index on pointers for non-world entities (Genesis City).
  // The existing GIN index on pointers covers all rows, but queries that
  // filter with metadata->'worldConfiguration'->>'name' IS NULL cannot
  // use the partial index idx_registries_world_configuration_name (which
  // only covers IS NOT NULL rows). This index lets PostgreSQL satisfy both
  // the array overlap and the IS NULL condition at index-scan time,
  // avoiding per-row JSONB extraction.
  pgm.createIndex('registries', 'pointers', {
    method: 'gin',
    name: 'idx_registries_pointers_non_world',
    where: "metadata->'worldConfiguration'->>'name' IS NULL"
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('registries', 'pointers', {
    name: 'idx_registries_pointers_non_world',
    ifExists: true
  })
}
