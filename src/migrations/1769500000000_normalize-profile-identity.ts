/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const BATCH_SIZE = 1000

/**
 * Settles the identity of already stored profiles from their pointer, which ingestion now does on the
 * way in. Rows written before that keep whatever `userId` and `ethAddress` the deployer wrote, and
 * those are what consumers read as the address of the profile.
 *
 * Only address pointers are touched: a default profile is pointed at by name and its metadata
 * legitimately carries the deployer's address. Rows that already agree are skipped, which is what
 * makes each batch shrink the remaining set and the loop terminate.
 *
 * Runs in batches outside a transaction: this table holds a row per profile on the network, so a
 * single statement over all of it would hold locks for as long as it takes while the service waits
 * to start.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.noTransaction()

  pgm.sql(`
    DO $$
    DECLARE
      updated integer;
    BEGIN
      LOOP
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
        WHERE p.id IN (
          SELECT candidate.id
          FROM profiles candidate
          WHERE lower(candidate.pointer) ~ '^0x[0-9a-f]{40}$'
            AND jsonb_typeof(candidate.metadata -> 'avatars') = 'array'
            -- a non-object element cannot be merged with, so such a row is left as it is rather
            -- than partially rewritten
            AND NOT EXISTS (
              SELECT 1
              FROM jsonb_array_elements(candidate.metadata -> 'avatars') AS avatar
              WHERE jsonb_typeof(avatar) <> 'object'
            )
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(candidate.metadata -> 'avatars') AS avatar
              WHERE avatar ->> 'ethAddress' IS DISTINCT FROM lower(candidate.pointer)
                 OR avatar ->> 'userId' IS DISTINCT FROM lower(candidate.pointer)
            )
          LIMIT ${BATCH_SIZE}
        );

        GET DIAGNOSTICS updated = ROW_COUNT;
        EXIT WHEN updated = 0;
        COMMIT;
      END LOOP;
    END $$;
  `)
}

export async function down(): Promise<void> {
  // The metadata this replaced is the deployed value, which is not recoverable from the row
}
