import { IBaseComponent } from '@well-known-components/interfaces'
import { IQueueComponent } from '@dcl/sqs-component'
import {
  CatalystFetchOptions,
  EntityStatusInQueue,
  EventHandlerName,
  MessageProcessorResult,
  EventHandlerResult,
  Registry,
  Sync,
  ProfileMetadataDTO,
  ProfileDTO
} from './types'
import { Entity, EthAddress } from '@dcl/schemas'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { SpawnCoordinate } from '../logic/coordinates/types'

/**
 * Result of an atomic world scenes undeployment operation.
 */
export type UndeploymentResult = {
  undeployedCount: number
  affectedWorlds: string[]
  spawnCoordinatesUpdated: string[]
}

/**
 * Parameters passed to the spawn recalculation function during atomic undeployment.
 */
export type SpawnRecalculationParams = {
  worldName: string
  parcels: string[]
  currentSpawn: SpawnCoordinate | null
}

/**
 * Result from the spawn recalculation function indicating what action to take.
 */
export type SpawnRecalculationResult = {
  action: 'delete' | 'upsert' | 'none'
  x?: number
  y?: number
  isUserSet?: boolean
}

/**
 * Parameters passed to the spawn recalculation function using bounding rectangle.
 * Used for efficient recalculation without fetching all parcels.
 */
export type SpawnRecalculationWithBoundsParams = {
  worldName: string
  boundingRectangle: WorldBoundingRectangle
  currentSpawn: SpawnCoordinate | null
}

/**
 * Result of getting world manifest data atomically.
 */
export type WorldManifestData = {
  parcels: string[]
  spawnCoordinate: SpawnCoordinate | null
}

/**
 * Bounding rectangle that covers all parcels in a world.
 * Returns null if the world has no processed scenes.
 */
export type WorldBoundingRectangle = {
  minX: number
  maxX: number
  minY: number
  maxY: number
} | null

/**
 * Result of setting a spawn coordinate atomically.
 */
export type SetSpawnCoordinateResult = {
  boundingRectangle: WorldBoundingRectangle
}

export interface IDbComponent {
  getSortedRegistriesByOwner(owner: EthAddress): Promise<Registry.DbEntity[]>
  getSortedRegistriesByPointers(
    pointers: string[],
    statuses?: Registry.Status[],
    descSort?: boolean,
    worldName?: string
  ): Promise<Registry.DbEntity[]>
  getRegistryById(id: string): Promise<Registry.DbEntity | null>
  insertRegistry(registry: Registry.DbEntity): Promise<Registry.DbEntity>
  updateRegistriesStatus(ids: string[], status: Registry.Status): Promise<Registry.DbEntity[]>
  upsertRegistryBundle(
    id: string,
    platform: string,
    lods: boolean,
    status: Registry.SimplifiedStatus
  ): Promise<Registry.DbEntity | null>
  updateRegistryVersionWithBuildDate(
    id: string,
    platform: string,
    version: string,
    buildDate: string
  ): Promise<Registry.DbEntity | null>
  getRelatedRegistries(registry: Pick<Registry.DbEntity, 'pointers' | 'id'>): Promise<Registry.PartialDbEntity[]>
  undeployRegistries(entityIds: string[]): Promise<number>
  deleteRegistries(entityIds: string[]): Promise<void>
  getBatchOfDeprecatedRegistriesOlderThan(
    dateInMilliseconds: number,
    failedIds: Set<string>,
    limit: number
  ): Promise<{ registries: Registry.DbEntity[] }>
  insertHistoricalRegistry(registry: Registry.DbEntity): Promise<Registry.DbEntity>
  getSortedHistoricalRegistriesByOwner(owner: EthAddress): Promise<Registry.DbEntity[]>
  getHistoricalRegistryById(id: string): Promise<Registry.DbEntity | null>
  // profiles
  upsertProfileIfNewer(profile: Sync.ProfileDbEntity): Promise<boolean>
  getProfileByPointer(pointer: string): Promise<Sync.ProfileDbEntity | null>
  getProfilesByPointers(pointers: string[]): Promise<Sync.ProfileDbEntity[]>
  getLatestProfileTimestamp(): Promise<number | null>
  markSnapshotProcessed(hash: string): Promise<void>
  isSnapshotProcessed(hash: string): Promise<boolean>
  insertFailedProfileFetch(failed: Sync.FailedProfileDbEntity): Promise<void>
  deleteFailedProfileFetch(entityId: string): Promise<void>
  updateFailedProfileFetchRetry(entityId: string, retryCount: number, errorMessage?: string): Promise<void>
  getFailedProfileFetches(limit: number, maxRetryCount?: number): Promise<Sync.FailedProfileDbEntity[]>
  getFailedProfileFetchByEntityId(entityId: string): Promise<Sync.FailedProfileDbEntity | null>
  // World spawn coordinate methods
  getSpawnCoordinate(worldName: string): Promise<SpawnCoordinate | null>
  upsertSpawnCoordinate(worldName: string, x: number, y: number, isUserSet: boolean): Promise<void>
  deleteSpawnCoordinate(worldName: string): Promise<void>
  getProcessedWorldParcels(worldName: string): Promise<string[]>
  getWorldBoundingRectangle(worldName: string): Promise<WorldBoundingRectangle>
  getRegistriesByIds(entityIds: string[]): Promise<Registry.DbEntity[]>
  // Atomic operations
  getWorldManifestData(worldName: string): Promise<WorldManifestData>
  setSpawnCoordinate(worldName: string, x: number, y: number, isUserSet: boolean): Promise<SetSpawnCoordinateResult>
  recalculateSpawnCoordinate(
    worldName: string,
    calculateSpawn: (params: SpawnRecalculationWithBoundsParams) => SpawnRecalculationResult
  ): Promise<void>
  undeployWorldScenes(
    entityIds: string[],
    calculateSpawnCoordinate: (params: SpawnRecalculationParams) => SpawnRecalculationResult
  ): Promise<UndeploymentResult>
}

export { IQueueComponent }

export interface IMessageConsumerComponent extends IBaseComponent {}

export interface IMessageProcessorComponent {
  process(message: any): Promise<MessageProcessorResult>
}

export interface ICatalystComponent {
  getEntityById(id: string, options?: CatalystFetchOptions): Promise<Entity | null>
  getEntitiesByIds(ids: string[], options?: CatalystFetchOptions): Promise<Entity[]>
  getEntityByPointers(pointers: string[]): Promise<Entity[]>
  getContent(id: string): Promise<Entity | undefined>
  getProfiles(pointers: string[]): Promise<Profile[]>
}

export interface IWorldsComponent {
  getWorld(entityId: string, contentServerUrl?: string): Promise<Entity | null>
  isWorldDeployment(event: DeploymentToSqs): boolean
}

export interface IEventHandlerComponent<T> {
  handle(event: T): Promise<EventHandlerResult>
  canHandle(event: T): boolean
  name: EventHandlerName
}

export interface IEntityStatusFetcherComponent {
  fetchBundleManifestData(
    entityId: string,
    platform: string
  ): Promise<{ status: Registry.SimplifiedStatus; version: string; buildDate: string }>
  fetchLODsStatus(entityId: string, platform: string): Promise<Registry.SimplifiedStatus>
}

export interface IRegistryOrchestratorComponent {
  persistAndRotateStates(registry: Omit<Registry.DbEntity, 'status'>): Promise<Registry.DbEntity>
}

export { IRegistryComponent } from '../logic/registry/component'

export interface ICacheStorage extends IBaseComponent {
  get<T>(key: string): Promise<T[]>
  set<T>(key: string, value: T): Promise<void>
  purge(key: string): Promise<void>
  flush(pattern: string): Promise<void>
}

export interface IQueuesStatusManagerComponent {
  markAsQueued(platform: 'windows' | 'mac' | 'webgl', entityId: string): Promise<void>
  markAsFinished(platform: 'windows' | 'mac' | 'webgl', entityId: string): Promise<void>
  getAllPendingEntities(platform: 'windows' | 'mac' | 'webgl'): Promise<EntityStatusInQueue[]>
}

export interface IProfilesCacheComponent {
  get(pointer: string): Entity | undefined
  getMany(pointers: string[]): Map<string, Entity>
  setIfNewer(pointer: string, profile: Entity): boolean
  setManyIfNewer(profiles: Entity[]): void
  has(pointer: string): boolean
  getAllPointers(): string[]
}

export interface IEntityDeploymentTrackerComponent {
  hasBeenProcessed(entityId: string): boolean
  markAsProcessed(entityId: string): void
  tryMarkDuplicate(entityId: string): boolean
}

export interface IProfileSanitizerComponent {
  sanitizeProfiles(
    minimalProfiles: Sync.ProfileDeployment[],
    notFoundProfilesHandler: (profile: Sync.ProfileDeployment | Sync.FailedProfileDbEntity) => Promise<void>
  ): Promise<Entity[]>
  getMetadata(profile: Entity): ProfileMetadataDTO
  mapEntitiesToProfiles(profiles: Entity[]): ProfileDTO[]
}

export interface IEntityPersisterComponent {
  persistEntity(entity: Entity): Promise<void>
  setBootstrapComplete(): void
  isBootstrapComplete(): boolean
  waitForDrain(): Promise<void>
}

export interface IProfilesSynchronizerComponent {
  syncProfiles(fromTimestamp: number, abortSignal: AbortSignal): Promise<number>
}

export interface IProfileRetrieverComponent {
  getProfile(pointer: string): Promise<Entity | null>
  getProfiles(pointers: string[]): Promise<Map<string, Entity>>
}

export interface IFailedProfilesRetrierComponent {
  retryFailedProfiles(abortSignal: AbortSignal): Promise<void>
}

export interface ISynchronizerComponent extends IBaseComponent {}

export { ICoordinatesComponent } from '../logic/coordinates/component'
