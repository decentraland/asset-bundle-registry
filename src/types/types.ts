import { Entity, EntityType } from '@dcl/schemas'

export namespace Sync {
  export type ProfileDbEntity = Omit<Entity, 'version' | 'pointers'> & {
    localTimestamp: number
    pointer: string // single pointer ensurance for simplicity over B-tree database index
  }

  export type CacheEntry = {
    profile: Entity
    localTimestamp: number
  }

  export type State = {
    bootstrapComplete: boolean
    lastPointerChangesCheck: number
  }

  export type ProfileDeployment = {
    entityId: string
    pointer: string
    timestamp: number
    authChain?: any
  }

  export type FailedProfileFetch = {
    entityId: string
    pointer: string
    timestamp: number
    authChain?: any
    firstFailedAt: number
    lastRetryAt?: number
    retryCount: number
    errorMessage?: string
  }
}

export namespace Registry {
  export enum SimplifiedStatus {
    PENDING = 'pending',
    COMPLETE = 'complete',
    FAILED = 'failed'
  }

  export type Bundles = {
    assets: {
      windows: SimplifiedStatus
      mac: SimplifiedStatus
      webgl: SimplifiedStatus
    }
    lods: {
      windows: SimplifiedStatus
      mac: SimplifiedStatus
      webgl: SimplifiedStatus
    }
  }

  export type Versions = {
    assets: {
      windows: { version: string; buildDate: string }
      mac: { version: string; buildDate: string }
      webgl: { version: string; buildDate: string }
    }
  }

  export type DbEntity = Omit<Entity, 'version' | 'type'> & { deployer: string; bundles: Bundles } & {
    status: Status
    type: EntityType | 'world'
    versions: Versions
  }

  export type PartialDbEntity = Pick<DbEntity, 'id' | 'pointers' | 'timestamp' | 'status' | 'bundles'>

  export enum Status {
    COMPLETE = 'complete',
    PENDING = 'pending',
    FAILED = 'failed',
    OBSOLETE = 'obsolete',
    FALLBACK = 'fallback'
  }
}

type StatusByPlatform = {
  mac: Registry.SimplifiedStatus
  windows: Registry.SimplifiedStatus
}

export type EntityStatus = {
  entityId: string
  complete: boolean
  lods?: StatusByPlatform
  assetBundles: StatusByPlatform
  catalyst: Registry.SimplifiedStatus
}

export enum EntityQueueStatusValue {
  STALE = 0,
  BUNDLE_PENDING = 1,
  BUNDLE_COMPLETE = -1
}

export type EntityStatusInQueue = {
  entityId: string
  platform: 'windows' | 'mac' | 'webgl'
  status: EntityQueueStatusValue
}

export type CatalystFetchOptions = {
  parallelFetch?: {
    catalystServers: string[]
  }
  overrideContentServerUrl?: string
}

export type EventHandlerResult = {
  ok: boolean
  errors?: string[]
  handlerName: EventHandlerName
}

export type RetryMessageData = {
  attempt: number
  failedHandlers: EventHandlerName[]
}

export enum EventHandlerName {
  DEPLOYMENT = 'Deployment Handler',
  TEXTURES = 'Textures Handler',
  STATUS = 'Status Handler'
}

export type MessageProcessorResult = {
  ok: boolean
  failedHandlers: EventHandlerName[]
}
