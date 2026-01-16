/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex('profiles', 'LOWER(pointer)', { name: 'idx_profiles_pointer_lower' })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('profiles', 'LOWER(pointer)', { name: 'idx_profiles_pointer_lower', ifExists: true })
}
