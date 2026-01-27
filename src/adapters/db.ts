import SQL, { SQLStatement } from 'sql-template-strings'
import { AppComponents, IDbComponent, Registry, Sync } from '../types'
import { EthAddress } from '@dcl/schemas'
import { SpawnCoordinate } from '../logic/coordinates/types'

/**
 * Result of an atomic world scenes undeployment operation.
 */
export type UndeploymentResult = {
  undeployedCount: number
  affectedWorlds: string[]
  spawnCoordinatesUpdated: string[]
}

/**
 * Parameters passed to the spawn recalculation function during atomic undeployment.
 */
export type SpawnRecalculationParams = {
  worldName: string
  parcels: string[]
  currentSpawn: SpawnCoordinate | null
}

/**
 * Result from the spawn recalculation function indicating what action to take.
 */
export type SpawnRecalculationResult = {
  action: 'delete' | 'upsert' | 'none'
  x?: number
  y?: number
  isUserSet?: boolean
}

export function createDbAdapter({ pg }: Pick<AppComponents, 'pg'>): IDbComponent {
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

  /**
   * Queries registries by pointers.
   *
   * When worldName is not provided, coordinates are treated as Genesis City coordinates
   * and world entities are excluded from results.
   *
   * When worldName is provided, only entities matching that world name (via metadata.worldConfiguration.name)
   * are returned.
   *
   * @param pointers - Array of pointers to search for (coordinates)
   * @param statuses - Optional status filter
   * @param descSort - Whether to sort by timestamp descending
   * @param worldName - Optional world name to filter by
   * @returns Matching registries
   */
  async function getSortedRegistriesByPointers(
    pointers: string[],
    statuses?: Registry.Status[],
    descSort: boolean = false,
    worldName?: string
  ): Promise<Registry.DbEntity[]> {
    const lowerCasePointers = pointers.map((p) => p.toLowerCase())

    // Build the base query with array overlap
    const query = SQL`
      SELECT 
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions
      FROM 
        registries
      WHERE (
        pointers && ${lowerCasePointers}::varchar(255)[]
    `

    query.append(SQL`)`)

    // Filter by world name if provided
    if (worldName) {
      const normalizedWorldName = worldName.toLowerCase()
      // When worldName is provided, only return entities matching that world name
      // The index idx_registries_world_configuration_name covers non-null cases,
      // so this query will use the index efficiently
      query.append(SQL`
        AND LOWER(metadata->'worldConfiguration'->>'name') = ${normalizedWorldName}
      `)
    } else {
      // When worldName is not provided, exclude worlds (treat coordinates as Genesis City)
      // Exclude entities that are worlds (have worldConfiguration.name)
      // Note: This won't use the index since we're filtering for NULL values
      query.append(SQL`
        AND metadata->'worldConfiguration'->>'name' IS NULL
      `)
    }

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

  /**
   * Marks registries and all their related fallbacks as OBSOLETE in a single atomic operation.
   *
   * This is used for world scene undeployments where:
   * 1. The target entities are marked as OBSOLETE
   * 2. Any registries sharing pointers with target entities that have FALLBACK status are also marked as OBSOLETE
   *
   * @param entityIds - Array of entity IDs to undeploy
   * @returns The total number of registries marked as OBSOLETE (including fallbacks)
   */
  async function undeployRegistries(entityIds: string[]): Promise<number> {
    if (entityIds.length === 0) {
      return 0
    }

    const parsedIds = entityIds.map((id) => id.toLowerCase())

    // Single atomic query that:
    // 1. Collects all pointers from target entities in a CTE
    // 2. Updates target entities and any FALLBACK registries sharing pointers
    // Uses array overlap (&&) operator for efficient index usage
    const query: SQLStatement = SQL`
      WITH target_pointers AS (
        SELECT array_agg(DISTINCT p) AS pointers
        FROM registries, unnest(pointers) AS p
        WHERE LOWER(id) = ANY(${parsedIds}::varchar(255)[])
      )
      UPDATE registries
      SET status = ${Registry.Status.OBSOLETE}
      WHERE
        LOWER(id) = ANY(${parsedIds}::varchar(255)[])
        OR (
          status = ${Registry.Status.FALLBACK}
          AND pointers && (SELECT pointers FROM target_pointers)
        )
    `

    const result = await pg.query(query)
    return result.rowCount ?? 0
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

  async function upsertProfileIfNewer(profile: Sync.ProfileDbEntity): Promise<boolean> {
    const query = SQL`
      INSERT INTO profiles (
        id, pointer, timestamp, content, metadata, local_timestamp
      )
      VALUES (
        ${profile.id},
        ${profile.pointer.toLowerCase()},
        ${profile.timestamp},
        ${JSON.stringify(profile.content)}::jsonb,
        ${JSON.stringify(profile.metadata)}::jsonb,
        ${profile.localTimestamp}
      )
      ON CONFLICT (pointer) DO UPDATE
      SET
        id = EXCLUDED.id,
        timestamp = EXCLUDED.timestamp,
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        local_timestamp = EXCLUDED.local_timestamp
      WHERE profiles.timestamp < EXCLUDED.timestamp
      RETURNING id
    `

    const result = await pg.query(query)
    return (result.rowCount ?? 0) > 0
  }

  async function getProfileByPointer(pointer: string): Promise<Sync.ProfileDbEntity | null> {
    const query = SQL`
      SELECT
        id, pointer, timestamp, content, metadata, local_timestamp as "localTimestamp"
      FROM
        profiles
      WHERE
        pointer = ${pointer.toLowerCase()}
      LIMIT 1
    `

    const result = await pg.query<Sync.ProfileDbEntity>(query)
    return result.rows[0] || null
  }

  async function getProfilesByPointers(pointers: string[]): Promise<Sync.ProfileDbEntity[]> {
    if (pointers.length === 0) {
      return []
    }

    const lowerCasePointers = pointers.map((p) => p.toLowerCase())
    const query = SQL`
      SELECT
        id, pointer, timestamp, content, metadata, local_timestamp as "localTimestamp"
      FROM
        profiles
      WHERE
        pointer = ANY(${lowerCasePointers}::varchar(255)[])
    `

    const result = await pg.query<Sync.ProfileDbEntity>(query)
    return result.rows
  }

  async function getLatestProfileTimestamp(): Promise<number | null> {
    const query = SQL`
      SELECT MAX(timestamp) as max_timestamp FROM profiles
    `

    const result = await pg.query<{ max_timestamp: string | null }>(query)
    const maxTimestamp = result.rows[0]?.max_timestamp
    return maxTimestamp ? parseInt(maxTimestamp, 10) : null
  }

  async function markSnapshotProcessed(hash: string): Promise<void> {
    const query = SQL`
      INSERT INTO processed_profile_snapshots (hash, process_time)
      VALUES (${hash}, NOW())
      ON CONFLICT (hash) DO NOTHING
    `

    await pg.query(query)
  }

  async function isSnapshotProcessed(hash: string): Promise<boolean> {
    const query = SQL`
      SELECT 1 FROM processed_profile_snapshots WHERE hash = ${hash}
    `

    const result = await pg.query(query)
    return (result.rowCount ?? 0) > 0
  }

  async function insertFailedProfileFetch(failed: Sync.FailedProfileDbEntity): Promise<void> {
    const query = SQL`
      INSERT INTO failed_profile_fetches (
        entity_id, pointer, timestamp, auth_chain, first_failed_at, last_retry_at, retry_count, error_message
      )
      VALUES (
        ${failed.entityId},
        ${failed.pointer.toLowerCase()},
        ${failed.timestamp},
        ${failed.authChain ? JSON.stringify(failed.authChain) : null}::jsonb,
        ${failed.firstFailedAt},
        ${failed.lastRetryAt || null},
        ${failed.retryCount},
        ${failed.errorMessage || null}
      )
      ON CONFLICT (entity_id) DO UPDATE
      SET
        pointer = EXCLUDED.pointer,
        timestamp = EXCLUDED.timestamp,
        auth_chain = EXCLUDED.auth_chain,
        first_failed_at = LEAST(failed_profile_fetches.first_failed_at, EXCLUDED.first_failed_at),
        last_retry_at = EXCLUDED.last_retry_at,
        retry_count = EXCLUDED.retry_count,
        error_message = EXCLUDED.error_message
    `

    await pg.query(query)
  }

  async function getFailedProfileFetches(limit: number, maxRetryCount?: number): Promise<Sync.FailedProfileDbEntity[]> {
    const query = SQL`
      SELECT
        entity_id as "entityId",
        pointer,
        timestamp,
        auth_chain as "authChain",
        first_failed_at as "firstFailedAt",
        last_retry_at as "lastRetryAt",
        retry_count as "retryCount",
        error_message as "errorMessage"
      FROM
        failed_profile_fetches
    `

    if (maxRetryCount !== undefined) {
      query.append(SQL` WHERE retry_count < ${maxRetryCount}`)
    }

    query.append(SQL`
      ORDER BY first_failed_at ASC, retry_count ASC
      LIMIT ${limit}
    `)

    const result = await pg.query<Sync.FailedProfileDbEntity>(query)
    return result.rows
  }

  async function deleteFailedProfileFetch(entityId: string): Promise<void> {
    const query = SQL`
      DELETE FROM failed_profile_fetches
      WHERE entity_id = ${entityId.toLowerCase()}
    `

    await pg.query(query)
  }

  async function updateFailedProfileFetchRetry(
    entityId: string,
    retryCount: number,
    errorMessage?: string
  ): Promise<void> {
    const query = SQL`
      UPDATE failed_profile_fetches
      SET
        last_retry_at = ${Date.now()},
        retry_count = ${retryCount},
        error_message = ${errorMessage || null}
      WHERE entity_id = ${entityId.toLowerCase()}
    `

    await pg.query(query)
  }

  async function getFailedProfileFetchByEntityId(entityId: string): Promise<Sync.FailedProfileDbEntity | null> {
    const query = SQL`
      SELECT
        entity_id as "entityId",
        pointer,
        timestamp,
        auth_chain as "authChain",
        first_failed_at as "firstFailedAt",
        last_retry_at as "lastRetryAt",
        retry_count as "retryCount",
        error_message as "errorMessage"
      FROM
        failed_profile_fetches
      WHERE
        entity_id = ${entityId.toLowerCase()}
    `

    const result = await pg.query<Sync.FailedProfileDbEntity>(query)
    return result.rows[0] || null
  }

  // World spawn coordinate methods

  /**
   * Gets the spawn coordinate for a world.
   * @param worldName - The world name (case-insensitive)
   * @returns The spawn coordinate or null if not found
   */
  async function getSpawnCoordinate(worldName: string): Promise<SpawnCoordinate | null> {
    const query = SQL`
      SELECT
        world_name as "worldName",
        x,
        y,
        is_user_set as "isUserSet",
        timestamp
      FROM
        world_spawn_coordinates
      WHERE
        LOWER(world_name) = ${worldName.toLowerCase()}
    `

    const result = await pg.query<SpawnCoordinate>(query)
    return result.rows[0] || null
  }

  /**
   * Upserts a spawn coordinate for a world.
   * @param worldName - The world name (case-insensitive, stored lowercase)
   * @param x - The x coordinate
   * @param y - The y coordinate
   * @param isUserSet - Whether this was explicitly set by the user
   */
  async function upsertSpawnCoordinate(
    worldName: string,
    x: number,
    y: number,
    isUserSet: boolean
  ): Promise<void> {
    const query = SQL`
      INSERT INTO world_spawn_coordinates (world_name, x, y, is_user_set, timestamp)
      VALUES (
        ${worldName.toLowerCase()},
        ${x},
        ${y},
        ${isUserSet},
        ${Date.now()}
      )
      ON CONFLICT (world_name) DO UPDATE
      SET
        x = EXCLUDED.x,
        y = EXCLUDED.y,
        is_user_set = EXCLUDED.is_user_set,
        timestamp = EXCLUDED.timestamp
    `

    await pg.query(query)
  }

  /**
   * Deletes the spawn coordinate for a world.
   * @param worldName - The world name (case-insensitive)
   */
  async function deleteSpawnCoordinate(worldName: string): Promise<void> {
    const query = SQL`
      DELETE FROM world_spawn_coordinates
      WHERE LOWER(world_name) = ${worldName.toLowerCase()}
    `

    await pg.query(query)
  }

  /**
   * Gets all processed (COMPLETE or FALLBACK) parcels for a world.
   * Returns a deduplicated list of all pointers from matching registries.
   * @param worldName - The world name (case-insensitive)
   * @returns Array of parcel strings in "x,y" format
   */
  async function getProcessedWorldParcels(worldName: string): Promise<string[]> {
    const query = SQL`
      SELECT DISTINCT unnest(pointers) as parcel
      FROM registries
      WHERE
        LOWER(metadata->'worldConfiguration'->>'name') = ${worldName.toLowerCase()}
        AND status IN (${Registry.Status.COMPLETE}, ${Registry.Status.FALLBACK})
    `

    const result = await pg.query<{ parcel: string }>(query)
    return result.rows.map((row) => row.parcel)
  }

  /**
   * Gets registries by world name for extracting world names from entity IDs.
   * Used by undeployment handler to get world names from entities being undeployed.
   * @param entityIds - Array of entity IDs
   * @returns Array of registries with their metadata
   */
  async function getRegistriesByIds(entityIds: string[]): Promise<Registry.DbEntity[]> {
    if (entityIds.length === 0) {
      return []
    }

    const parsedIds = entityIds.map((id) => id.toLowerCase())
    const query = SQL`
      SELECT
        id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions
      FROM
        registries
      WHERE
        LOWER(id) = ANY(${parsedIds}::varchar(255)[])
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows
  }

  /**
   * Atomically undeploys world scenes and recalculates spawn coordinates.
   *
   * This method performs the entire operation within a database transaction to prevent
   * race conditions between reading the world state and updating spawn coordinates.
   *
   * The operation:
   * 1. Gets registries by IDs to extract world names
   * 2. Marks target registries and fallbacks as OBSOLETE
   * 3. For each affected world, recalculates spawn coordinates using the provided function
   *
   * @param entityIds - Array of entity IDs to undeploy
   * @param calculateSpawnCoordinate - Pure function to determine spawn coordinate action
   * @returns Result containing counts and affected worlds
   */
  async function undeployWorldScenesAtomic(
    entityIds: string[],
    calculateSpawnCoordinate: (params: SpawnRecalculationParams) => SpawnRecalculationResult
  ): Promise<UndeploymentResult> {
    if (entityIds.length === 0) {
      return {
        undeployedCount: 0,
        affectedWorlds: [],
        spawnCoordinatesUpdated: []
      }
    }

    const client = await pg.getPool().connect()

    try {
      await client.query('BEGIN')

      const parsedIds = entityIds.map((id) => id.toLowerCase())

      // 1. Get registries to extract world names
      const registriesQuery = SQL`
        SELECT
          id, type, timestamp, deployer, pointers, content, metadata, status, bundles, versions
        FROM
          registries
        WHERE
          LOWER(id) = ANY(${parsedIds}::varchar(255)[])
      `
      const registriesResult = await client.query<Registry.DbEntity>(registriesQuery)
      const registries = registriesResult.rows

      const worldNames = new Set<string>()
      for (const registry of registries) {
        const worldName = (registry.metadata as any)?.worldConfiguration?.name
        if (worldName) {
          worldNames.add(worldName.toLowerCase())
        }
      }

      // 2. Undeploy registries (mark as OBSOLETE) - same logic as undeployRegistries
      const undeployQuery = SQL`
        WITH target_pointers AS (
          SELECT array_agg(DISTINCT p) AS pointers
          FROM registries, unnest(pointers) AS p
          WHERE LOWER(id) = ANY(${parsedIds}::varchar(255)[])
        )
        UPDATE registries
        SET status = ${Registry.Status.OBSOLETE}
        WHERE
          LOWER(id) = ANY(${parsedIds}::varchar(255)[])
          OR (
            status = ${Registry.Status.FALLBACK}
            AND pointers && (SELECT pointers FROM target_pointers)
          )
      `
      const undeployResult = await client.query(undeployQuery)
      const undeployedCount = undeployResult.rowCount ?? 0

      // 3. Recalculate spawn coordinates for affected worlds
      const spawnCoordinatesUpdated: string[] = []

      for (const worldName of worldNames) {
        // Get processed world parcels (COMPLETE or FALLBACK status)
        const parcelsQuery = SQL`
          SELECT DISTINCT unnest(pointers) as parcel
          FROM registries
          WHERE
            LOWER(metadata->'worldConfiguration'->>'name') = ${worldName}
            AND status IN (${Registry.Status.COMPLETE}, ${Registry.Status.FALLBACK})
        `
        const parcelsResult = await client.query<{ parcel: string }>(parcelsQuery)
        const parcels = parcelsResult.rows.map((r) => r.parcel)

        // Get current spawn coordinate
        const spawnQuery = SQL`
          SELECT
            world_name as "worldName",
            x,
            y,
            is_user_set as "isUserSet",
            timestamp
          FROM
            world_spawn_coordinates
          WHERE
            LOWER(world_name) = ${worldName}
        `
        const spawnResult = await client.query<SpawnCoordinate>(spawnQuery)
        const currentSpawn = spawnResult.rows[0] || null

        // Call pure function to determine action
        const result = calculateSpawnCoordinate({
          worldName,
          parcels,
          currentSpawn
        })

        // Apply result
        if (result.action === 'delete') {
          const deleteQuery = SQL`
            DELETE FROM world_spawn_coordinates
            WHERE LOWER(world_name) = ${worldName}
          `
          await client.query(deleteQuery)
          spawnCoordinatesUpdated.push(worldName)
        } else if (result.action === 'upsert' && result.x !== undefined && result.y !== undefined) {
          const upsertQuery = SQL`
            INSERT INTO world_spawn_coordinates (world_name, x, y, is_user_set, timestamp)
            VALUES (
              ${worldName},
              ${result.x},
              ${result.y},
              ${result.isUserSet ?? false},
              ${Date.now()}
            )
            ON CONFLICT (world_name) DO UPDATE
            SET
              x = EXCLUDED.x,
              y = EXCLUDED.y,
              is_user_set = EXCLUDED.is_user_set,
              timestamp = EXCLUDED.timestamp
          `
          await client.query(upsertQuery)
          spawnCoordinatesUpdated.push(worldName)
        }
      }

      await client.query('COMMIT')

      return {
        undeployedCount,
        affectedWorlds: Array.from(worldNames),
        spawnCoordinatesUpdated
      }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
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
    undeployRegistries,
    getBatchOfDeprecatedRegistriesOlderThan,
    insertHistoricalRegistry,
    getSortedHistoricalRegistriesByOwner,
    getHistoricalRegistryById,
    upsertProfileIfNewer,
    getProfileByPointer,
    getProfilesByPointers,
    getLatestProfileTimestamp,
    markSnapshotProcessed,
    isSnapshotProcessed,
    insertFailedProfileFetch,
    deleteFailedProfileFetch,
    updateFailedProfileFetchRetry,
    getFailedProfileFetches,
    getFailedProfileFetchByEntityId,
    // World spawn coordinate methods
    getSpawnCoordinate,
    upsertSpawnCoordinate,
    deleteSpawnCoordinate,
    getProcessedWorldParcels,
    getRegistriesByIds,
    // Atomic operations
    undeployWorldScenesAtomic
  }
}
