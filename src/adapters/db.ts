import { AppComponents, DbComponent } from '../types'

export function createDbComponent({ pg }: Pick<AppComponents, 'pg'>): DbComponent {
  return {
    getVoid: async () => {
      return
    }
  }
}
