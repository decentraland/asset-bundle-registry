/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Origin of the worlds content server a world row came from. NULL means the default
  // (prd) worlds server, so every existing row keeps belonging to it without a backfill.
  pgm.addColumn('registries', {
    source_content_server_url: { type: 'varchar(255)', notNull: false }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('registries', 'source_content_server_url', { ifExists: true })
}
