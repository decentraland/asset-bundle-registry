/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Create a GIN index on metadata->worldConfiguration->>name for efficient world name lookups
  // This index supports queries filtering by world name in the WHERE clause
  pgm.createIndex('registries', "LOWER(metadata->'worldConfiguration'->>'name')", {
    name: 'idx_registries_world_configuration_name',
    where: "metadata->'worldConfiguration'->>'name' IS NOT NULL"
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('registries', "LOWER(metadata->'worldConfiguration'->>'name')", {
    name: 'idx_registries_world_configuration_name',
    ifExists: true
  })
}
