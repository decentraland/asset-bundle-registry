/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const REGISTRIES_TABLE = 'registries'
const HISTORICAL_REGISTRIES_TABLE = 'historical_registries'
const VERSION_COLUMN = 'version'

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(REGISTRIES_TABLE, {
    [VERSION_COLUMN]: { type: 'varchar(10)', notNull: false }
  })
  pgm.addColumn(HISTORICAL_REGISTRIES_TABLE, {
    [VERSION_COLUMN]: { type: 'varchar(10)', notNull: false }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(REGISTRIES_TABLE, VERSION_COLUMN)
  pgm.dropColumn(HISTORICAL_REGISTRIES_TABLE, VERSION_COLUMN)
}
