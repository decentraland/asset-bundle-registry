import SQL, { SQLStatement } from 'sql-template-strings'
import { AppComponents, DbComponent } from '../types'
import { Registry } from '../types/types'

export function createDbAdapter({ pg }: Pick<AppComponents, 'pg'>): DbComponent {
  async function getRegistriesByPointers(pointers: string[]): Promise<Registry.DbEntity[] | null> {
    const query = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles
      FROM 
        registries
      WHERE 
        pointers && ${pointers}::varchar(255)[] AND status = 'optimized'
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
        id = ${id}
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
          ${registry.id},
          ${registry.type},
          ${registry.timestamp},
          ${registry.deployer},
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

  async function updateRegistryStatus(id: string, status: Registry.StatusValues): Promise<Registry.DbEntity | null> {
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

  async function upsertRegistryBundle(id: string, platform: string, status: string): Promise<Registry.DbEntity | null> {
    const query: SQLStatement = SQL`
      UPDATE registries
      SET 
        bundles = COALESCE(bundles, '{}'::jsonb) || jsonb_build_object(${platform}::text, ${status}::text),
        status = CASE
          WHEN (
            (COALESCE(bundles, '{}'::jsonb) || jsonb_build_object(${platform}::text, ${status}::text))->>'windows' = 'optimized'
            AND
            (COALESCE(bundles, '{}'::jsonb) || jsonb_build_object(${platform}::text, ${status}::text))->>'mac' = 'optimized'
            AND
            (COALESCE(bundles, '{}'::jsonb) || jsonb_build_object(${platform}::text, ${status}::text))->>'webglb' = 'optimized'
          ) THEN 'optimized'
          ELSE status
        END
      WHERE id = ${id}
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

  async function remove(entityIds: string[]): Promise<void> {
    const query: SQLStatement = SQL`
      DELETE FROM registries
      WHERE id = ANY(${entityIds}::varchar(255)[])
    `

    await pg.query(query)
  }

  return {
    insertRegistry,
    updateRegistryStatus,
    upsertRegistryBundle,
    getRegistriesByPointers,
    getRegistryById,
    getRelatedRegistries,
    remove
  }
}
