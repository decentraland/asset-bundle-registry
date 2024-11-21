/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('registries', {
    entity_id: { type: 'varchar(255)', primaryKey: true },
    pointer: { type: 'varchar(255)', notNull: true, unique: true },
    asset_bundles: { type: 'jsonb[]', notNull: true, default: '{}' },
    created_at: { type: 'bigint', notNull: true, default: pgm.func('EXTRACT(EPOCH FROM NOW()) * 1000') },
    updated_at: { type: 'bigint', notNull: true, default: pgm.func('EXTRACT(EPOCH FROM NOW()) * 1000') }
  })

  pgm.createIndex('registries', 'pointer')
  pgm.createIndex('registries', 'entity_id')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('registries')
}
