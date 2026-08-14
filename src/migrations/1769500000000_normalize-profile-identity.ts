/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

/**
 * Settles the identity of already stored profiles from their pointer, which ingestion now does on the
 * way in. Rows written before that keep whatever `userId` and `ethAddress` the deployer wrote, and
 * those are what consumers read as the address of the profile.
 *
 * Only address pointers are touched: a default profile is pointed at by name and its metadata
 * legitimately carries the deployer's address. Rows that already agree are left alone.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    UPDATE profiles p
    SET metadata = jsonb_set(
          p.metadata,
          '{avatars}',
          (
            SELECT jsonb_agg(
                     avatar || jsonb_build_object('userId', lower(p.pointer), 'ethAddress', lower(p.pointer))
                     ORDER BY position
                   )
            FROM jsonb_array_elements(p.metadata -> 'avatars') WITH ORDINALITY AS elements(avatar, position)
          )
        )
    WHERE lower(p.pointer) ~ '^0x[0-9a-f]{40}$'
      AND jsonb_typeof(p.metadata -> 'avatars') = 'array'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p.metadata -> 'avatars') AS avatar
        WHERE avatar ->> 'ethAddress' IS DISTINCT FROM lower(p.pointer)
           OR avatar ->> 'userId' IS DISTINCT FROM lower(p.pointer)
      )
  `)
}

export async function down(): Promise<void> {
  // The metadata this replaced is the deployed value, which is not recoverable from the row
}
