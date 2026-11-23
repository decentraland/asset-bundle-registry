import { Color3, Entity, EntityType, Profile } from '@dcl/schemas'

export namespace Sync {
  export type ProfileDbEntity = Omit<Entity, 'version' | 'pointers' | 'content'> & {
    localTimestamp: number
    pointer: string // single pointer ensurance for simplicity over B-tree database index
    content: Entity['content'] | null // nullable for profiles fetched from lambdas-only
  }

  export type FailedProfileDbEntity = {
    entityId: string
    pointer: string
    timestamp: number
    authChain?: any
    firstFailedAt: number
    lastRetryAt?: number
    retryCount: number
    errorMessage?: string
  }

  export type CacheEntry = {
    profile: Entity
    localTimestamp: number
  }

  export type ProfileDeployment = {
    entityId: string
    pointer: string
    timestamp: number
    authChain?: any
  }
}

export type ProfileDTO = Profile & { timestamp: number }

export type ProfileMetadataDTO = {
  pointer: string
  hasClaimedName: boolean
  name: string
  nameColor?: Color3
  thumbnailUrl: string
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
    }
    // LODs are optional - worlds don't support LODs
    lods?: {
      windows: SimplifiedStatus
      mac: SimplifiedStatus
    }
  }

  export type Versions = {
    assets: {
      windows: { version: string; buildDate: string }
      mac: { version: string; buildDate: string }
    }
  }

  export type DbEntity = Omit<Entity, 'version' | 'type'> & { deployer: string; bundles: Bundles } & {
    status: Status
    type: EntityType | 'world'
    versions: Versions
    /** Origin of the worlds content server the row came from; null/absent = the default (prd) worlds server. */
    sourceContentServerUrl?: string | null
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
  // LODs are optional - worlds don't support LODs
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
  platform: SupportedPlatform
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
  /** The original `sourceContentServerUrl` message attribute, carried so retries keep their source. */
  sourceContentServerUrl?: string
}

/** SNS/SQS message attribute naming the content server a worlds event came from. */
export const SOURCE_CONTENT_SERVER_URL_ATTRIBUTE = 'sourceContentServerUrl'

/** Transport-level data of a queue message that is not part of the event body. */
export type MessageAttributes = {
  /** Raw, unvalidated `sourceContentServerUrl` attribute. */
  sourceContentServerUrl?: string
}

/** Per-message context handed to event handlers. */
export type EventContext = {
  /** Allowlisted origin of the server that emitted the event; null = the default (prd) worlds server. */
  sourceContentServerUrl: string | null
}

/** Context of a message without a source attribute: it came from the default (prd) worlds server. */
export const DEFAULT_EVENT_CONTEXT: EventContext = Object.freeze({ sourceContentServerUrl: null })

export enum EventHandlerName {
  DEPLOYMENT = 'Deployment Handler',
  TEXTURES = 'Textures Handler',
  STATUS = 'Status Handler',
  UNDEPLOYMENT = 'Undeployment Handler',
  WORLD_UNDEPLOYMENT = 'World Undeployment Handler',
  SPAWN_COORDINATE = 'Spawn Coordinate Handler'
}

export namespace Denylist {
  export type DbEntity = {
    entity_id: string
    reason: string | null
    created_by: string
    created_at: number // bigint ms
    updated_at: number // bigint ms
  }
}

export type MessageProcessorResult = {
  ok: boolean
  failedHandlers: EventHandlerName[]
}

/**
 * Platforms supported for asset bundle conversion.
 * WebGL was decommissioned — stale events with platform 'webgl' must be
 * filtered out at the handler entry point.
 */
export const SUPPORTED_PLATFORMS = ['windows', 'mac'] as const
export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number]

export function isSupportedPlatform(p: string): p is SupportedPlatform {
  return (SUPPORTED_PLATFORMS as readonly string[]).includes(p)
}
