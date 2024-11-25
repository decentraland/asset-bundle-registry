import SQL, { SQLStatement } from 'sql-template-strings'
import { AppComponents, DbComponent } from '../types'
import { Registry } from '../types/types'

export function createDbAdapter({ pg }: Pick<AppComponents, 'pg'>): DbComponent {
  async function getRegistry(pointer: string): Promise<Registry> {
    const query: SQLStatement = SQL`
      SELECT entity_id as entityId, timestamp, pointer, asset_bundles as assetBundles FROM registries
      WHERE pointer = ${pointer}
    `

    const result = await pg.query<Registry>(query)
    return result.rows[0]
  }

  // async function upsertRegistry(pointer: string): Promise<Registry> {
  //   const query: SQLStatement = SQL`
  //     INSERT INTO registries (pointer, asset_bundles)
  //     VALUES (${pointer}, ${[]})
  //     ON CONFLICT (pointer) DO NOTHING
  //     RETURNING entity_id as entityId, timestamp, pointer, asset_bundles as assetBundles
  //   `

  //   const result = await pg.query<Registry>(query)
  //   return result.rows[0]
  // }

  async function upsertRegistry(
    pointer: string,
    newBundle: { version: string; mac: string[]; windows: string[]; timestamp: number }
  ): Promise<Registry> {
    const query: SQLStatement = SQL`
      INSERT INTO registries (pointer, asset_bundles)
      VALUES (${pointer}, ARRAY[${JSON.stringify(newBundle)}]::jsonb[])
      ON CONFLICT (pointer) DO UPDATE 
      SET asset_bundles = (
        SELECT array_slice(
          array_append(registries.asset_bundles, ${JSON.stringify(newBundle)}::jsonb),
          GREATEST(array_length(registries.asset_bundles, 1) - 2, 1),
          array_length(registries.asset_bundles, 1) + 1
        )
      )
      RETURNING entity_id AS "entityId", timestamp, pointer, asset_bundles AS "assetBundles"
    `

    const result = await pg.query<Registry>(query)
    return result.rows[0]
  }

  return {
    getRegistry,
    upsertRegistry
  }
}
