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
}
