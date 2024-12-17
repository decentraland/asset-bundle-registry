/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addIndex('registries', 'status')
  pgm.addIndex('registries', 'timestamp')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('registries', 'status')
  pgm.dropIndex('registries', 'timestamp')
}
