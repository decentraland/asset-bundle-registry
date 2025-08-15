import SQL, { SQLStatement } from 'sql-template-strings'
import { AppComponents, DbComponent } from '../types'
import { Registry } from '../types/types'
import { EthAddress } from '@dcl/schemas'

export function createDbAdapter({ pg }: Pick<AppComponents, 'pg'>): DbComponent {
  async function getSortedRegistriesByOwner(owner: EthAddress): Promise<Registry.DbEntity[]> {
    const query: SQLStatement = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions
      FROM 
        registries
      WHERE 
        LOWER(deployer) = ${owner.toLocaleLowerCase()}
      ORDER BY timestamp DESC
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows
  }

  async function getSortedRegistriesByPointers(
    pointers: string[],
    statuses?: Registry.Status[],
    descSort: boolean = false
  ): Promise<Registry.DbEntity[]> {
    const lowerCasePointers = pointers.map((p) => p.toLowerCase())
    const query = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions
      FROM 
        registries
      WHERE 
        pointers && ${lowerCasePointers}::varchar(255)[]
    `

    if (statuses) {
      query.append(SQL`
        AND status = ANY(${statuses}::varchar(255)[])
      `)
    }

    if (descSort) {
      query.append(SQL`
        ORDER BY timestamp DESC
      `)
    }

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows
  }

  async function getRegistryById(id: string): Promise<Registry.DbEntity | null> {
    const query: SQLStatement = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions
      FROM 
        registries
      WHERE 
        LOWER(id) = ${id.toLocaleLowerCase()}
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0] || null
  }

  async function insertRegistry(registry: Registry.DbEntity): Promise<Registry.DbEntity> {
    const query: SQLStatement = SQL`
        INSERT INTO registries (
          id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions
        )
        VALUES (
          ${registry.id},
          ${registry.type},
          ${registry.timestamp},
          ${registry.deployer.toLocaleLowerCase()},
          ${registry.pointers}::varchar(255)[],
          ${JSON.stringify(registry.content)}::jsonb,
          ${JSON.stringify(registry.metadata)}::jsonb,
          ${registry.status},
          ${JSON.stringify(registry.bundles)}::jsonb,
          ${JSON.stringify(registry.versions)}::jsonb
        )
        ON CONFLICT (id) DO UPDATE 
        SET
          type = EXCLUDED.type,
          timestamp = EXCLUDED.timestamp,
          pointers = EXCLUDED.pointers,
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          status = EXCLUDED.status,
          bundles = EXCLUDED.bundles,
          deployer = CASE
            WHEN EXCLUDED.deployer != '' THEN EXCLUDED.deployer
            ELSE registries.deployer
          END,
          versions = EXCLUDED.versions
        RETURNING 
          id,
          type,
          timestamp,
          deployer,
          pointers,
          content,
          metadata,
          status,
          bundles,
          versions
      `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0]
  }

  async function updateRegistriesStatus(ids: string[], status: Registry.Status): Promise<Registry.DbEntity[]> {
    const parsedIds = ids.map((id) => id.toLocaleLowerCase())

    const query: SQLStatement = SQL`
        UPDATE registries
        SET status = ${status}
        WHERE LOWER(id) = ANY(${parsedIds}::varchar(255)[])
        RETURNING 
          id,
          type,
          timestamp,
          pointers,
          deployer,
          content,
          metadata,
          status,
          bundles,
          versions
      `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows || null
  }

  async function upsertRegistryBundle(
    id: string,
    platform: string,
    lods: boolean,
    status: Registry.SimplifiedStatus
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
      WHERE LOWER(registries.id) = ${id.toLocaleLowerCase()}
      RETURNING *
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0] || null
  }

  async function updateRegistryVersionWithBuildDate(
    id: string,
    platform: string,
    version: string,
    buildDate: string
  ): Promise<Registry.DbEntity | null> {
    const bundleType = 'assets'
    const versionData = { version, buildDate }
    const query: SQLStatement = SQL`
      UPDATE registries
      SET 
        versions = jsonb_set(
          COALESCE(registries.versions, '{}'::jsonb),
          ARRAY[${bundleType}::text, ${platform}::text], 
          to_jsonb(${versionData}::jsonb)
        )
      WHERE LOWER(registries.id) = ${id.toLocaleLowerCase()}
      RETURNING *
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0] || null
  }

  async function getRelatedRegistries(
    registry: Pick<Registry.DbEntity, 'pointers' | 'id'>
  ): Promise<Registry.PartialDbEntity[]> {
    const lowerCasePointers = registry.pointers.map((p) => p.toLowerCase())
    const query: SQLStatement = SQL`
      SELECT 
        id, pointers, timestamp, status, bundles, versions
      FROM 
        registries
      WHERE 
        pointers && ${lowerCasePointers}::varchar(255)[] AND LOWER(id) != ${registry.id.toLocaleLowerCase()} AND status != ${Registry.Status.OBSOLETE}
      ORDER BY timestamp DESC
    `

    const result = await pg.query<Registry.PartialDbEntity>(query)
    return result.rows
  }

  async function deleteRegistries(entityIds: string[]): Promise<void> {
    const MAX_BATCH_SIZE = 1000

    for (let i = 0; i < entityIds.length; i += MAX_BATCH_SIZE) {
      const parsedIdsChunk = entityIds.slice(i, i + MAX_BATCH_SIZE).map((id) => id.toLocaleLowerCase())
      const query: SQLStatement = SQL`
        DELETE FROM registries
        WHERE LOWER(id) = ANY(${parsedIdsChunk}::varchar(255)[])
      `

      await pg.query(query)
    }
  }

  async function getBatchOfDeprecatedRegistriesOlderThan(
    dateInMilliseconds: number,
    failedIds: Set<string>,
    limit: number = 100
  ): Promise<{ registries: Registry.DbEntity[] }> {
    const parsedIds = Array.from(failedIds)
      .map((id) => `'${id.toLocaleLowerCase()}'`)
      .join(',')

    const baseQuery = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions
      FROM 
        registries
      WHERE 
        timestamp < ${dateInMilliseconds}
        AND status NOT IN (${Registry.Status.COMPLETE}::text, ${Registry.Status.FALLBACK}::text, ${Registry.Status.PENDING}::text)
        AND LOWER(id) NOT IN (${parsedIds})
      ORDER BY 
        timestamp DESC
      LIMIT ${limit}
    `

    const result = await pg.query<Registry.DbEntity>(baseQuery)

    return {
      registries: result.rows
    }
  }

  async function insertHistoricalRegistry(registry: Registry.DbEntity): Promise<Registry.DbEntity> {
    const query: SQLStatement = SQL`
        INSERT INTO historical_registries (
          id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions, migrated_at
        )
        VALUES (
          ${registry.id},
          ${registry.type},
          ${registry.timestamp},
          ${registry.deployer.toLocaleLowerCase()},
          ${registry.pointers}::varchar(255)[],
          ${JSON.stringify(registry.content)}::jsonb,
          ${JSON.stringify(registry.metadata)}::jsonb,
          ${registry.status},
          ${JSON.stringify(registry.bundles)}::jsonb,
          ${JSON.stringify(registry.versions)}::jsonb,
          ${Date.now()}
        )
        ON CONFLICT (id) DO UPDATE 
        SET
          type = EXCLUDED.type,
          timestamp = EXCLUDED.timestamp,
          pointers = EXCLUDED.pointers,
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          status = EXCLUDED.status,
          bundles = EXCLUDED.bundles,
          versions = EXCLUDED.versions
        RETURNING 
          id,
          type,
          timestamp,
          deployer,
          pointers,
          content,
          metadata,
          status,
          bundles,
          versions
      `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0]
  }

  async function getSortedHistoricalRegistriesByOwner(owner: EthAddress): Promise<Registry.DbEntity[]> {
    const query: SQLStatement = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions
      FROM 
        historical_registries
      WHERE 
        LOWER(deployer) = ${owner.toLocaleLowerCase()}
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows
  }

  async function getHistoricalRegistryById(id: string): Promise<Registry.DbEntity | null> {
    const query: SQLStatement = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions
      FROM 
        historical_registries
      WHERE 
        LOWER(id) = ${id.toLocaleLowerCase()}
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0] || null
  }

  return {
    insertRegistry,
    updateRegistriesStatus,
    upsertRegistryBundle,
    updateRegistryVersionWithBuildDate,
    getSortedRegistriesByOwner,
    getSortedRegistriesByPointers,
    getRegistryById,
    getRelatedRegistries,
    deleteRegistries,
    getBatchOfDeprecatedRegistriesOlderThan,
    insertHistoricalRegistry,
    getSortedHistoricalRegistriesByOwner,
    getHistoricalRegistryById
  }
}
