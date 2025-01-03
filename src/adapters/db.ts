import SQL, { SQLStatement } from 'sql-template-strings'
import { AppComponents, DbComponent } from '../types'
import { Registry } from '../types/types'
import { EthAddress } from '@dcl/schemas'

export function createDbAdapter({ pg }: Pick<AppComponents, 'pg'>): DbComponent {
  async function getSortedRegistriesByOwner(owner: EthAddress): Promise<Registry.DbEntity[]> {
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

  async function getRegistriesByPointers(pointers: string[]): Promise<Registry.DbEntity[]> {
    const query = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles
      FROM 
        registries
      WHERE 
        pointers && ${pointers}::varchar(255)[] AND (status = ${Registry.Status.COMPLETE}::text OR status = ${Registry.Status.FALLBACK}::text)
      ORDER BY timestamp DESC
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

  async function updateRegistriesStatus(ids: string[], status: Registry.Status): Promise<Registry.DbEntity[]> {
    const query: SQLStatement = SQL`
        UPDATE registries
        SET status = ${status}
        WHERE id = ANY(${ids}::varchar(255)[])
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
    return result.rows || null
  }

  async function upsertRegistryBundle(
    id: string,
    platform: string,
    lods: boolean,
    status: string
  ): Promise<Registry.DbEntity | null> {
    const bundleType = lods ? 'lods' : 'assets'
    const query: SQLStatement = SQL`
      UPDATE registries
      SET 
        bundles = jsonb_set(
          registries.bundles,
          ARRAY[${bundleType}::text, ${platform}::text], 
          to_jsonb(${status}::text)
        )
      WHERE registries.id = ${id.toLowerCase()}
      RETURNING *
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0] || null
  }

  async function getRelatedRegistries(
    registry: Pick<Registry.DbEntity, 'pointers' | 'id'>
  ): Promise<Registry.PartialDbEntity[]> {
    const query: SQLStatement = SQL`
      SELECT 
        id, pointers, timestamp, status, bundles
      FROM 
        registries
      WHERE 
        pointers && ${registry.pointers}::varchar(255)[] AND id != ${registry.id} AND status != ${Registry.Status.OBSOLETE}
      ORDER BY timestamp DESC
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
    updateRegistriesStatus,
    upsertRegistryBundle,
    getSortedRegistriesByOwner,
    getRegistriesByPointers,
    getRegistryById,
    getRelatedRegistries,
    deleteRegistries
  }
}
