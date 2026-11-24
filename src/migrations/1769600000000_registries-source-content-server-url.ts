/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Fail fast instead of queueing all registries traffic behind the ACCESS EXCLUSIVE lock; a failed
  // boot retries the migration. LOCAL keeps it inside the migration transaction.
  pgm.sql(`SET LOCAL lock_timeout = '5s'`)
  // Origin of the worlds content server a world row came from. NULL means the default
  // (prd) worlds server, so every existing row keeps belonging to it without a backfill.
  pgm.addColumn('registries', {
    source_content_server_url: { type: 'varchar(255)', notNull: false }
  })
}

// Dropping the column loses every row's source (historical_registries never carries it): after a
// rollback all world rows count as the default server's again.
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`SET LOCAL lock_timeout = '5s'`)
  pgm.dropColumn('registries', 'source_content_server_url', { ifExists: true })
}
