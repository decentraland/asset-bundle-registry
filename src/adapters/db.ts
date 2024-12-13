import SQL, { SQLStatement } from 'sql-template-strings'
import { AppComponents, DbComponent } from '../types'
import { Registry } from '../types/types'
import { EthAddress } from '@dcl/schemas'

export function createDbAdapter({ pg }: Pick<AppComponents, 'pg'>): DbComponent {
  async function getRegistriesByOwner(owner: EthAddress): Promise<Registry.DbEntity[] | null> {
    const query: SQLStatement = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles
      FROM 
        registries
      WHERE 
        deployer = ${owner.toLocaleLowerCase()}
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows
  }

  async function getRegistriesByPointers(pointers: string[]): Promise<Registry.DbEntity[] | null> {
    const query = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles
      FROM 
        registries
      WHERE 
        pointers && ${pointers}::varchar(255)[] AND status = 'complete'
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows
  }

  async function getRegistryById(id: string): Promise<Registry.DbEntity | null> {
    const query: SQLStatement = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles
      FROM 
        registries
      WHERE 
        id = ${id.toLocaleLowerCase()}
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0] || null
  }

  async function insertRegistry(registry: Registry.DbEntity): Promise<Registry.DbEntity> {
    const query: SQLStatement = SQL`
        INSERT INTO registries (
          id, type, timestamp, deployer, pointers, content, metadata, status, bundles
        )
        VALUES (
          ${registry.id.toLocaleLowerCase()},
          ${registry.type},
          ${registry.timestamp},
          ${registry.deployer.toLocaleLowerCase()},
          ${registry.pointers}::varchar(255)[],
          ${JSON.stringify(registry.content)}::jsonb,
          ${JSON.stringify(registry.metadata)}::jsonb,
          ${registry.status},
          ${JSON.stringify(registry.bundles)}::jsonb
        )
        ON CONFLICT (id) DO UPDATE 
        SET
          type = EXCLUDED.type,
          timestamp = EXCLUDED.timestamp,
          deployer = EXCLUDED.deployer,
          pointers = EXCLUDED.pointers,
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          status = EXCLUDED.status,
          bundles = EXCLUDED.bundles
        RETURNING 
          id,
          type,
          timestamp,
          deployer,
          pointers,
          content,
          metadata,
          status,
          bundles
      `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0]
  }

  async function updateRegistryStatus(id: string, status: Registry.Status): Promise<Registry.DbEntity | null> {
    const query: SQLStatement = SQL`
        UPDATE registries
        SET status = ${status}
        WHERE id = ${id}
        RETURNING 
          id,
          type,
          timestamp,
          pointers,
          deployer,
          content,
          metadata,
          status,
          bundles
      `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0] || null
  }

  async function upsertRegistryBundle(
    id: string,
    platform: string,
    lods: boolean,
    status: string
  ): Promise<Registry.DbEntity | null> {
    const bundleType = lods ? 'lods' : 'assets'
    const query: SQLStatement = SQL`
    WITH updated_registry AS (
      UPDATE registries
      SET 
        bundles = jsonb_set(
          bundles, 
          ARRAY[${bundleType}::text, ${platform}::text], 
          to_jsonb(${status}::text)
        )
      WHERE id = ${id.toLowerCase()}
      RETURNING *
    )
    UPDATE registries AS r
    SET 
      status = CASE
        WHEN (
          r.bundles->'assets'->>'windows' = 'complete'
          AND
          r.bundles->'assets'->>'mac' = 'complete'
        ) THEN 'complete'
        ELSE r.status
      END
    FROM updated_registry AS ur
    WHERE r.id = ur.id
    RETURNING 
      r.id,
      r.type,
      r.timestamp,
      r.deployer,
      r.pointers,
      r.content,
      r.metadata,
      r.status,
      r.bundles
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0] || null
  }

  async function getRelatedRegistries(registry: Registry.DbEntity): Promise<Registry.PartialDbEntity[] | null> {
    const query: SQLStatement = SQL`
      SELECT 
        id, pointers, timestamp, status, bundles
      FROM 
        registries
      WHERE 
        pointers && ${registry.pointers}::varchar(255)[] AND id != ${registry.id}
    `

    const result = await pg.query<Registry.PartialDbEntity>(query)
    return result.rows
  }

  async function deleteRegistries(entityIds: string[]): Promise<void> {
    const query: SQLStatement = SQL`
      DELETE FROM registries
      WHERE id = ANY(${entityIds}::varchar(255)[])
    `

    await pg.query(query)
  }

  async function markRegistriesAsObsolete(entityIds: string[]): Promise<void> {
    const query: SQLStatement = SQL`
      UPDATE registries
      SET status = 'obsolete'
      WHERE id = ANY(${entityIds}::varchar(255)[])
    `

    await pg.query(query)
  }

  return {
    insertRegistry,
    updateRegistryStatus,
    upsertRegistryBundle,
    getRegistriesByOwner,
    getRegistriesByPointers,
    getRegistryById,
    getRelatedRegistries,
    deleteRegistries,
    markRegistriesAsObsolete
  }
}
