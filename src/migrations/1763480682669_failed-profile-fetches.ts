/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('failed_profile_fetches', {
    entity_id: { type: 'varchar(255)', notNull: true, primaryKey: true },
    pointer: { type: 'varchar(255)', notNull: true },
    timestamp: { type: 'bigint', notNull: true },
    auth_chain: { type: 'jsonb' },
    first_failed_at: { type: 'bigint', notNull: true },
    last_retry_at: { type: 'bigint' },
    retry_count: { type: 'integer', notNull: true, default: 0 },
    error_message: { type: 'text' }
  })

  pgm.createIndex('failed_profile_fetches', 'LOWER(pointer)', { name: 'idx_failed_fetches_pointer' })
  pgm.createIndex('failed_profile_fetches', 'LOWER(entity_id)', { name: 'idx_failed_fetches_entity_id' })
  pgm.createIndex('failed_profile_fetches', 'retry_count', { name: 'idx_failed_fetches_retry_count' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('failed_profile_fetches', 'LOWER(entity_id)', { name: 'idx_failed_fetches_entity_id', ifExists: true })
  pgm.dropIndex('failed_profile_fetches', 'LOWER(pointer)', { name: 'idx_failed_fetches_pointer', ifExists: true })
  pgm.dropIndex('failed_profile_fetches', 'retry_count', { name: 'idx_failed_fetches_retry_count', ifExists: true })
  pgm.dropTable('failed_profile_fetches', { ifExists: true })
}
