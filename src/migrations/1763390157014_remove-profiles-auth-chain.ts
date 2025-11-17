/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn('profiles', 'auth_chain')
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('profiles', {
    auth_chain: { type: 'jsonb', notNull: true, default: '[]' }
  })
}
