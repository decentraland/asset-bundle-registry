/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('denylist', {
    entity_id: { type: 'varchar(255)', notNull: true, primaryKey: true },
    reason: { type: 'text', notNull: false },
    created_by: { type: 'varchar(255)', notNull: true },
    created_at: { type: 'bigint', notNull: true },
    updated_at: { type: 'bigint', notNull: true }
  })

  pgm.createIndex('denylist', 'LOWER(entity_id)', {
    name: 'idx_denylist_entity_id_lower'
  })

  pgm.createIndex('denylist', 'LOWER(created_by)', {
    name: 'idx_denylist_created_by_lower'
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('denylist', [], { name: 'idx_denylist_entity_id_lower', ifExists: true })
  pgm.dropIndex('denylist', [], { name: 'idx_denylist_created_by_lower', ifExists: true })
  pgm.dropTable('denylist', { ifExists: true })
}
