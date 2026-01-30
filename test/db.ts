import { SQL } from 'sql-template-strings'
import { SQLStatement } from 'sql-template-strings'
import { AppComponents, IDbComponent } from '../src/types'
import { SpawnCoordinate } from '../src/logic/coordinates/types'

export function extendDbComponent({ db, pg }: Pick<AppComponents, 'db' | 'pg'>): IDbComponent & {
  deleteHistoricalRegistries: (ids: string[]) => Promise<void>
  deleteProfiles: (pointers: string[]) => Promise<void>
  deleteSpawnCoordinates: (worldNames: string[]) => Promise<void>
  insertSpawnCoordinate: (
    worldName: string,
    x: number,
    y: number,
    isUserSet: boolean,
    timestamp: number
  ) => Promise<void>
  getSpawnCoordinateByWorldName: (worldName: string) => Promise<SpawnCoordinate | null>
  close: () => Promise<void>
} {
  return {
    ...db,
    deleteHistoricalRegistries: async (ids: string[]) => {
      const query: SQLStatement = SQL`
            DELETE FROM historical_registries
            WHERE LOWER(id) = ANY(${ids.map((id) => id.toLocaleLowerCase())}::varchar(255)[])
          `

      await pg.query(query)
    },
    deleteProfiles: async (pointers: string[]) => {
      const query: SQLStatement = SQL`
            DELETE FROM profiles
            WHERE pointer = ANY(${pointers.map((p) => p.toLowerCase())}::varchar(255)[])
          `

      await pg.query(query)
    },
    deleteSpawnCoordinates: async (worldNames: string[]) => {
      const query: SQLStatement = SQL`
            DELETE FROM world_spawn_coordinates
            WHERE LOWER(world_name) = ANY(${worldNames.map((n) => n.toLowerCase())}::varchar(255)[])
          `

      await pg.query(query)
    },
    insertSpawnCoordinate: async (worldName: string, x: number, y: number, isUserSet: boolean, timestamp: number) => {
      const query: SQLStatement = SQL`
            INSERT INTO world_spawn_coordinates (world_name, x, y, is_user_set, timestamp)
            VALUES (${worldName.toLowerCase()}, ${x}, ${y}, ${isUserSet}, ${timestamp})
            ON CONFLICT (world_name) DO UPDATE
            SET x = EXCLUDED.x, y = EXCLUDED.y, is_user_set = EXCLUDED.is_user_set, timestamp = EXCLUDED.timestamp
          `

      await pg.query(query)
    },
    getSpawnCoordinateByWorldName: async (worldName: string) => {
      const query: SQLStatement = SQL`
            SELECT
              world_name as "worldName",
              x,
              y,
              is_user_set as "isUserSet",
              timestamp
            FROM world_spawn_coordinates
            WHERE LOWER(world_name) = ${worldName.toLowerCase()}
          `

      const result = await pg.query<SpawnCoordinate>(query)
      return result.rows[0] || null
    },
    close: async () => {
      await pg.getPool().end()
    }
  }
}
