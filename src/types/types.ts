import { Entity } from '@dcl/schemas'

export namespace Registry {
  export type Bundles = {
    assets: {
      windows: Status
      mac: Status
      webgl: Status
    }
    lods: {
      windows: Status
      mac: Status
      webgl: Status
    }
  }

  export type DbEntity = Omit<Entity, 'version'> & { deployer: string; bundles: Bundles } & {
    status: Status | 'obsolete'
    isLatest: boolean
  }

  export type PartialDbEntity = Pick<DbEntity, 'id' | 'pointers' | 'timestamp' | 'status' | 'bundles'>

  export enum Status {
    COMPLETE = 'complete',
    PENDING = 'pending',
    FAILED = 'failed'
  }

  type StatusByPlatform = {
    mac: Status
    windows: Status
  }

  export type EntityStatus = {
    complete: boolean
    lods: StatusByPlatform
    assetBundles: StatusByPlatform
    catalyst: Status
  }
}

export enum ManifestStatusCode {
  SUCCESS = 0,
  UNDEFINED = 1,
  SCENE_LIST_NULL = 2,
  ASSET_BUNDLE_BUILD_FAIL = 3,
  VISUAL_TEST_FAILED = 4,
  UNEXPECTED_ERROR = 5,
  GLTFAST_CRITICAL_ERROR = 6,
  GLTF_IMPORTER_NOT_FOUND = 7,
  EMBED_MATERIAL_FAILURE = 8,
  DOWNLOAD_FAILED = 9,
  INVALID_PLATFORM = 10,
  GLTF_PROCESS_MISMATCH = 11,
  CONVERSION_ERRORS_TOLERATED = 12,
  ALREADY_CONVERTED = 13
}

export type Manifest = {
  version: string
  files: string[]
  exitCode: ManifestStatusCode
  contentServerUrl: string
  date: string
}
