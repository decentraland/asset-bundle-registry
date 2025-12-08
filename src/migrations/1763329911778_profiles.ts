/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('profiles', {
    id: { type: 'varchar(255)', notNull: true, primaryKey: true },
    pointer: { type: 'varchar(255)', notNull: true, unique: true },
    timestamp: { type: 'bigint', notNull: true },
    content: { type: 'jsonb', notNull: true },
    metadata: { type: 'jsonb', notNull: true },
    local_timestamp: { type: 'bigint', notNull: true }
  })

  pgm.createIndex('profiles', 'timestamp', { name: 'idx_profiles_timestamp' })
  pgm.createIndex('profiles', 'local_timestamp', { name: 'idx_profiles_local_timestamp' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('profiles', 'local_timestamp', { name: 'idx_profiles_local_timestamp', ifExists: true })
  pgm.dropIndex('profiles', 'timestamp', { name: 'idx_profiles_timestamp', ifExists: true })
  pgm.dropTable('profiles', { ifExists: true })
}
