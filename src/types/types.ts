import { Entity } from '@dcl/schemas'

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

  export type DbEntity = Omit<Entity, 'version'> & { deployer: string; bundles: Bundles } & {
    status: Status
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
  lods: StatusByPlatform
  assetBundles: StatusByPlatform
  catalyst: Registry.SimplifiedStatus
}
