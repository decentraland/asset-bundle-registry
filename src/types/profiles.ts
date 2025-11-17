import { AuthChain, ContentMapping } from '@dcl/schemas'

export namespace Profile {
  export type Entity = {
    id: string
    pointer: string
    timestamp: number
    content: ContentMapping[]
    metadata: Record<string, unknown>
    authChain: AuthChain
  }

  export type DbEntity = Entity & {
    localTimestamp: number
  }

  export type CacheEntry = {
    profile: Entity
    localTimestamp: number
  }

  export type SyncState = {
    bootstrapComplete: boolean
    lastPointerChangesCheck: number
  }
}
