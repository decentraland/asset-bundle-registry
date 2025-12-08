/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('processed_profile_snapshots', {
    hash: { type: 'varchar(255)', notNull: true, primaryKey: true },
    process_time: { type: 'timestamp', notNull: true }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('processed_profile_snapshots', { ifExists: true })
}
