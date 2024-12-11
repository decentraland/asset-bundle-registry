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
            (COALESCE(bundles, '{}'::jsonb) || jsonb_build_object(${platform}::text, ${status}::text))->>'windows' = 'complete'
            AND
            (COALESCE(bundles, '{}'::jsonb) || jsonb_build_object(${platform}::text, ${status}::text))->>'mac' = 'complete'
            AND
            (COALESCE(bundles, '{}'::jsonb) || jsonb_build_object(${platform}::text, ${status}::text))->>'webglb' = 'complete'
          ) THEN 'complete'
          ELSE status
        END
      WHERE id = ${id.toLocaleLowerCase()}
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

  async function deleteRegistries(entityIds: string[]): Promise<void> {
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
    getRegistriesByOwner,
    getRegistriesByPointers,
    getRegistryById,
    getRelatedRegistries,
    deleteRegistries
  }
}
