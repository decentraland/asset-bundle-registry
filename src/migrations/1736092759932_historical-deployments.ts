/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('historical_registries', {
    id: { type: 'varchar(255)', notNull: true, primaryKey: true },
    type: { type: 'varchar(255)', notNull: true },
    timestamp: { type: 'bigint', notNull: true },
    pointers: { type: 'varchar(255)[]', notNull: true },
    content: { type: 'jsonb', notNull: true },
    metadata: { type: 'jsonb' },
    status: { type: 'varchar(255)', notNull: true },
    bundles: { type: 'jsonb', notNull: true },
    deployer: { type: 'varchar(255)', notNull: true },
    migrated_at: { type: 'bigint', notNull: true }
  })

  pgm.createIndex('historical_registries', 'deployer')
  pgm.createIndex('historical_registries', 'pointers', { method: 'gin' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('historical_registries', 'pointers', { ifExists: true })
  pgm.dropIndex('historical_registries', 'deployer', { ifExists: true })
  pgm.dropTable('historical_registries', { ifExists: true })
}
