/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const INDEX_NAME = 'idx_profiles_wearing_collections_v2'

/**
 * Indexes the profiles that wear at least one collections-v2 item, about 2% of the table: nearly every
 * profile wears base wearables only.
 *
 * The marketplace server's co-wear rebuild reads profiles through this index. It is only used when a
 * query repeats this exact predicate, so the rebuild's query (`SELECT_CO_WORN` in marketplace-server)
 * must be kept in step with it.
 *
 * Built concurrently so the service keeps reading and writing profiles meanwhile, which needs to run
 * outside a transaction. A concurrent build that fails leaves an invalid index behind, so the index is
 * dropped first rather than created with IF NOT EXISTS, which would keep that invalid one.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()

  pgm.sql(`DROP INDEX CONCURRENTLY IF EXISTS ${INDEX_NAME}`)
  pgm.sql(`
    CREATE INDEX CONCURRENTLY ${INDEX_NAME}
      ON profiles (pointer)
      WHERE lower((metadata -> 'avatars' -> 0 -> 'avatar' -> 'wearables')::text) LIKE '%collections-v2%'
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()

  pgm.sql(`DROP INDEX CONCURRENTLY IF EXISTS ${INDEX_NAME}`)
}
