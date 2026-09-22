/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate'

export const shorthands: ColumnDefinitions | undefined = undefined

const ACTIVE_WINDOW = '90 days'
const MIN_SUPPORT = 5
const TOP_PARTNERS_PER_ITEM = 50

/**
 * Items worn together by profiles deployed within the active window, scored by cosine and lift and
 * capped to each item's strongest partners. It is read through a foreign table by other databases,
 * so the aggregation runs here and only the capped pairs cross over.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE VIEW item_co_occurrence AS
    WITH items AS (
      SELECT DISTINCT
        p.pointer,
        -- collections-v2 URNs end in the token id, which would make each owned copy a different item
        regexp_replace(lower(w), '^(urn:decentraland:[^:]+:collections-v2:0x[0-9a-f]+:\\d+):\\d+$', '\\1') AS item
      FROM profiles p,
        jsonb_array_elements_text(p.metadata -> 'avatars' -> 0 -> 'avatar' -> 'wearables') AS w
      WHERE lower(w) NOT LIKE 'urn:decentraland:off-chain:base-avatars:%'
        AND lower(w) NOT LIKE 'dcl://base-avatars/%'
        AND p.timestamp > (extract(epoch FROM now() - interval '${ACTIVE_WINDOW}') * 1000)::bigint
    ),
    population AS (
      SELECT count(DISTINCT pointer)::float AS n FROM items
    ),
    item_counts AS (
      SELECT item, count(*) AS n FROM items GROUP BY item
    ),
    pairs AS (
      SELECT a.item AS item_a, b.item AS item_b, count(*) AS n_ab
      FROM items a
      JOIN items b ON a.pointer = b.pointer AND a.item <> b.item
      GROUP BY a.item, b.item
      HAVING count(*) >= ${MIN_SUPPORT}
    ),
    scored AS (
      SELECT
        p.item_a,
        p.item_b,
        p.n_ab,
        ca.n AS n_a,
        cb.n AS n_b,
        p.n_ab / sqrt(ca.n::float * cb.n) AS cosine,
        p.n_ab * pop.n / (ca.n::float * cb.n) AS lift
      FROM pairs p
      JOIN item_counts ca ON ca.item = p.item_a
      JOIN item_counts cb ON cb.item = p.item_b
      CROSS JOIN population pop
    )
    SELECT item_a, item_b, n_ab, n_a, n_b, cosine, lift
    FROM (
      SELECT scored.*, row_number() OVER (PARTITION BY item_a ORDER BY cosine DESC, item_b) AS rank
      FROM scored
    ) ranked
    WHERE rank <= ${TOP_PARTNERS_PER_ITEM};
  `)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('DROP VIEW IF EXISTS item_co_occurrence;')
}
