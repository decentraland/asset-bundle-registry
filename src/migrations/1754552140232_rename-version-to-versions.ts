/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

const REGISTRIES_TABLE = 'registries'
const HISTORICAL_REGISTRIES_TABLE = 'historical_registries'
const VERSION_COLUMN = 'version'
const VERSIONS_COLUMN = 'versions'

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(REGISTRIES_TABLE, VERSION_COLUMN)
  pgm.dropColumn(HISTORICAL_REGISTRIES_TABLE, VERSION_COLUMN)

  pgm.addColumn(REGISTRIES_TABLE, {
    [VERSIONS_COLUMN]: { type: 'jsonb', notNull: false }
  })
  pgm.addColumn(HISTORICAL_REGISTRIES_TABLE, {
    [VERSIONS_COLUMN]: { type: 'jsonb', notNull: false }
  })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(REGISTRIES_TABLE, VERSIONS_COLUMN)
  pgm.dropColumn(HISTORICAL_REGISTRIES_TABLE, VERSIONS_COLUMN)

  pgm.addColumn(REGISTRIES_TABLE, {
    [VERSION_COLUMN]: { type: 'varchar(10)', notNull: false }
  })
  pgm.addColumn(HISTORICAL_REGISTRIES_TABLE, {
    [VERSION_COLUMN]: { type: 'varchar(10)', notNull: false }
  })
}
