import SQL, { SQLStatement } from 'sql-template-strings'
import { AppComponents, DbComponent } from '../types'
import { Registry } from '../types/types'

export function createDbAdapter({ pg }: Pick<AppComponents, 'pg'>): DbComponent {
  async function getRegistry(pointers: string[]): Promise<Registry.DbEntity | null> {
    const query: SQLStatement = SQL`
      SELECT 
        id, type, version, timestamp, pointers, content, metadata, status
      FROM 
        registries
      WHERE 
        pointers && ARRAY[${pointers}]::text[]
      ORDER BY 
        timestamp DESC
      LIMIT 1
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
          ARRAY[${registry.pointers.map((p) => SQL`${p}`)}]::varchar[],
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

  return { insertRegistry, getRegistry }
}
