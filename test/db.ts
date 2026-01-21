import { SQL } from 'sql-template-strings'
import { SQLStatement } from 'sql-template-strings'
import { AppComponents, IDbComponent } from '../src/types'

export function extendDbComponent({ db, pg }: Pick<AppComponents, 'db' | 'pg'>): IDbComponent & {
  deleteHistoricalRegistries: (ids: string[]) => Promise<void>
  deleteProfiles: (pointers: string[]) => Promise<void>
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
    close: async () => {
      await pg.getPool().end()
    }
  }
}
