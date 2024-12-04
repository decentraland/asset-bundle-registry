import SQL, { SQLStatement } from 'sql-template-strings'
import { AppComponents, DbComponent } from '../types'
import { Registry } from '../types/types'

export function createDbAdapter({ pg }: Pick<AppComponents, 'pg'>): DbComponent {
  async function getRegistryByPointers(pointers: string[]): Promise<Registry.DbEntity[] | null> {
    const query = SQL`
      SELECT 
        id, type, timestamp, pointers, content, metadata, status
      FROM 
        registries
      WHERE 
        pointers && ${pointers}::varchar(255)[]
      ORDER BY 
        timestamp DESC
    `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows
  }

  async function getRegistryById(id: string): Promise<Registry.DbEntity | null> {
    const query: SQLStatement = SQL`
      SELECT 
        id, type, timestamp, pointers, content, metadata, status
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
          id, type, timestamp, pointers, content, metadata, status
        )
        VALUES (
          ${registry.id},
          ${registry.type},
          ${registry.timestamp},
          ${registry.pointers}::varchar(255)[],
          ${JSON.stringify(registry.content)}::jsonb,
          ${JSON.stringify(registry.metadata)}::jsonb,
          ${registry.status}
        )
        ON CONFLICT (id) DO UPDATE 
        SET
          type = EXCLUDED.type,
          timestamp = EXCLUDED.timestamp,
          pointers = EXCLUDED.pointers,
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          status = EXCLUDED.status
        RETURNING 
          id,
          type,
          timestamp,
          pointers,
          content,
          metadata,
          status
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
          content,
          metadata,
          status
      `

    const result = await pg.query<Registry.DbEntity>(query)
    return result.rows[0] || null
  }

  return { insertRegistry, updateRegistryStatus, getRegistryByPointers, getRegistryById }
}
