import { Message } from '@aws-sdk/client-sqs'
import { IBaseComponent } from '@well-known-components/interfaces'
import {
  CatalystFetchOptions,
  EntityStatusInQueue,
  EventHandlerName,
  MessageProcessorResult,
  EventHandlerResult,
  Registry,
  Sync
} from './types'
import { Entity, EthAddress } from '@dcl/schemas'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'

export type DbComponent = {
  // Registry functions
  getSortedRegistriesByOwner(owner: EthAddress): Promise<Registry.DbEntity[]>
  getSortedRegistriesByPointers(
    pointers: string[],
    statuses?: Registry.Status[],
    descSort?: boolean
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
  deleteRegistries(entityIds: string[]): Promise<void>
  getBatchOfDeprecatedRegistriesOlderThan(
    dateInMilliseconds: number,
    failedIds: Set<string>,
    limit: number
  ): Promise<{ registries: Registry.DbEntity[] }>
  insertHistoricalRegistry(registry: Registry.DbEntity): Promise<Registry.DbEntity>
  getSortedHistoricalRegistriesByOwner(owner: EthAddress): Promise<Registry.DbEntity[]>
  getHistoricalRegistryById(id: string): Promise<Registry.DbEntity | null>
  // Profile functions
  getProfileByPointer(pointer: string): Promise<Sync.ProfileDbEntity | null>
  getProfilesByPointers(pointers: string[]): Promise<Sync.ProfileDbEntity[]>
  upsertProfileIfNewer(profile: Sync.ProfileDbEntity): Promise<boolean>
  markSnapshotProcessed(hash: string): Promise<void>
  isSnapshotProcessed(hash: string): Promise<boolean>
  getLatestProfileTimestamp(): Promise<number | null>
  // Failed fetch tracking
  insertFailedProfileFetch(failed: Sync.FailedProfileFetch): Promise<void>
  getFailedProfileFetches(limit: number, maxRetryCount?: number): Promise<Sync.FailedProfileFetch[]>
  deleteFailedProfileFetch(entityId: string): Promise<void>
  updateFailedProfileFetchRetry(entityId: string, retryCount: number, errorMessage?: string): Promise<void>
  getFailedProfileFetchByEntityId(entityId: string): Promise<Sync.FailedProfileFetch | null>
}

export type QueueMessage = any

export type QueueComponent = {
  send(message: QueueMessage): Promise<void>
  receiveMessages(amount: number): Promise<Message[]>
  deleteMessage(receiptHandle: string): Promise<void>
}

export type MessageConsumerComponent = IBaseComponent

export type MessageProcessorComponent = {
  process(message: any): Promise<MessageProcessorResult>
}

export type CatalystComponent = {
  getEntityById(id: string, options?: CatalystFetchOptions): Promise<Entity | null>
  getEntitiesByIds(ids: string[], options?: CatalystFetchOptions): Promise<Entity[]>
  getEntityByPointers(pointers: string[]): Promise<Entity[]>
  getContent(id: string): Promise<Entity | undefined>
  /**
   * Fetches profiles from lamb2 with ownership validation.
   * Returns sanitized profiles with non-owned items removed
   * (wearables/emotes that were transferred and no longer belong to the user).
   */
  getSanitizedProfiles(pointers: string[]): Promise<Entity[]>
}

export type WorldsComponent = {
  getWorld(worldId: string, worldContentServerUrl?: string): Promise<Entity | null>
  isWorldDeployment(event: DeploymentToSqs): boolean
}

export type EventHandlerComponent<T> = {
  handle(event: T): Promise<EventHandlerResult>
  canHandle(event: T): boolean
  name: EventHandlerName
}

export type EntityStatusFetcher = {
  fetchBundleManifestData(
    entityId: string,
    platform: string
  ): Promise<{ status: Registry.SimplifiedStatus; version: string; buildDate: string }>
  fetchLODsStatus(entityId: string, platform: string): Promise<Registry.SimplifiedStatus>
}

export type RegistryOrchestratorComponent = {
  persistAndRotateStates(registry: Omit<Registry.DbEntity, 'status'>): Promise<Registry.DbEntity>
}

export type ICacheStorage = IBaseComponent & {
  get<T>(key: string): Promise<T[]>
  set<T>(key: string, value: T): Promise<void>
  purge(key: string): Promise<void>
  flush(pattern: string): Promise<void>
}

export type QueuesStatusManagerComponent = {
  markAsQueued(platform: 'windows' | 'mac' | 'webgl', entityId: string): Promise<void>
  markAsFinished(platform: 'windows' | 'mac' | 'webgl', entityId: string): Promise<void>
  getAllPendingEntities(platform: 'windows' | 'mac' | 'webgl'): Promise<EntityStatusInQueue[]>
}

export interface IHotProfilesCacheComponent {
  get(pointer: string): Entity | undefined
  getMany(pointers: string[]): Map<string, Entity>
  setIfNewer(pointer: string, profile: Entity): boolean
  setManyIfNewer(profiles: Entity[]): void
  has(pointer: string): boolean
  getAllPointers(): string[]
}

export interface IEntityTrackerComponent {
  hasBeenProcessed(entityId: string): boolean
  markAsProcessed(entityId: string): void
  tryMarkDuplicate(entityId: string): boolean
}

export interface IEntityPersistentComponent {
  persistEntity(entity: Entity): Promise<void>
  setBootstrapComplete(): void
  isBootstrapComplete(): boolean
  waitForDrain(): Promise<void>
}

export interface ISynchronizerComponent extends IBaseComponent {}

export interface ISynchronizerStateManagerComponent {
  loadLastCursor(): Promise<number>
}

export interface IProfilesSynchronizerComponent {
  syncProfiles(fromTimestamp: number, abortSignal: AbortSignal): Promise<number>
}

export interface IFailedProfilesRetrierComponent {
  retryFailedProfiles(abortSignal: AbortSignal): Promise<void>
}

export interface IProfileSanitizerComponent {
  sanitizeProfiles(
    minimalProfiles: Sync.ProfileDeployment[] | Sync.FailedProfileFetch[],
    notFoundProfilesHandler: (profile: Sync.ProfileDeployment) => Promise<void>
  ): Promise<Entity[]>
}

export interface IProfileRetrieverComponent {
  getProfile(pointer: string): Promise<Entity | null>
  getProfiles(pointers: string[]): Promise<Map<string, Entity>>
}

// Re-export IContentStorageComponent for convenience
export type { IContentStorageComponent as SnapshotContentStorageComponent } from '@dcl/catalyst-storage'
