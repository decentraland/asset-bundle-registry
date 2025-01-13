/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex('registries', 'LOWER(id)', {
    name: 'registries_id_lower_idx'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('registries', 'LOWER(id)', {
    name: 'registries_id_lower_idx'
  })
}
