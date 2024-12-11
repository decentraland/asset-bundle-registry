import { Entity } from '@dcl/schemas'

export namespace Registry {
  export enum BundleStatusValues {
    PENDING = 'pending',
    OPTMIZED = 'optimized',
    ERROR = 'error'
  }

  export type Bundles = {
    windows: {
      status: BundleStatusValues
    }
    mac: {
      status: BundleStatusValues
    }
    webglb: {
      status: BundleStatusValues
    }
  }

  export type DbEntity = Omit<Entity, 'version'> & { deployer: string; bundles: Bundles } & Status

  export type PartialDbEntity = Pick<DbEntity, 'id' | 'pointers' | 'timestamp' | 'status' | 'bundles'>

  export enum EntityStatusValues {
    COMPLETE = 'complete',
    PENDING = 'pending',
    ERROR = 'error'
  }

  type StatusByPlatform = {
    mac: EntityStatusValues
    windows: EntityStatusValues
  }

  export type EntityStatus = {
    complete: boolean
    lods: StatusByPlatform
    assetBundles: StatusByPlatform
    catalyst: EntityStatusValues
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
