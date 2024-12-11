import { Entity } from '@dcl/schemas'

export namespace Registry {
  export type Bundles = {
    windows: StatusValues
    mac: StatusValues
    webglb: StatusValues
  }

  export type DbEntity = Omit<Entity, 'version'> & { deployer: string; bundles: Bundles } & {
    status: StatusValues
  }

  export type PartialDbEntity = Pick<DbEntity, 'id' | 'pointers' | 'timestamp' | 'status' | 'bundles'>

  export enum StatusValues {
    COMPLETE = 'complete',
    PENDING = 'pending',
    ERROR = 'error'
  }

  type StatusByPlatform = {
    mac: StatusValues
    windows: StatusValues
  }

  export type EntityStatus = {
    complete: boolean
    lods: StatusByPlatform
    assetBundles: StatusByPlatform
    catalyst: StatusValues
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
  CONVERSION_ERRORS_TOLERATED = 12
}

export type Manifest = {
  version: string
  files: string[]
  exitCode: ManifestStatusCode
  contentServerUrl: string
  date: string
}
