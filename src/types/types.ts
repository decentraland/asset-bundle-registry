import { Entity, EntityType } from '@dcl/schemas'

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

  export type DbEntity = Omit<Entity, 'version' | 'type'> & { deployer: string; bundles: Bundles } & {
    status: Status
    type: EntityType | 'world'
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
