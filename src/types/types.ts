import { Entity } from '@dcl/schemas'

export namespace Registry {
  export type Status = {
    status: StatusValues
  }

  export enum StatusValues {
    PENDING = 'pending',
    OPTMIZED = 'optimized',
    ERROR = 'error'
  }

  export type Bundles = {
    windows: StatusValues
    mac: StatusValues
    webglb: StatusValues
  }

  export type DbEntity = Omit<Entity, 'version'> & { deployer: string; bundles: Bundles } & Status

  export type PartialDbEntity = Pick<DbEntity, 'id' | 'pointers' | 'timestamp' | 'status' | 'bundles'>
}

export enum ManifestStatusCode {
  SUCCESS,
  UNDEFINED,
  SCENE_LIST_NULL,
  ASSET_BUNDLE_BUILD_FAIL,
  VISUAL_TEST_FAILED,
  UNEXPECTED_ERROR,
  GLTFAST_CRITICAL_ERROR,
  GLTF_IMPORTER_NOT_FOUND,
  EMBED_MATERIAL_FAILURE,
  DOWNLOAD_FAILED,
  INVALID_PLATFORM,
  GLTF_PROCESS_MISMATCH,
  CONVERSION_ERRORS_TOLERATED
}

export type Manifest = {
  version: string
  files: string[]
  exitCode: ManifestStatusCode
  contentServerUrl: string
  date: string
}
