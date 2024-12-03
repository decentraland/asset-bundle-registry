/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('registries', {
    id: { type: 'varchar(255)', notNull: true, primaryKey: true },
    type: { type: 'varchar(255)', notNull: true },
    timestamp: { type: 'bigint', notNull: true },
    pointers: { type: 'varchar(255)[]', notNull: true },
    content: { type: 'jsonb', notNull: true },
    metadata: { type: 'jsonb' },
    status: { type: 'varchar(255)', notNull: true }
  })

  pgm.createIndex('registries', 'pointers', { method: 'gin' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('registries')
}
