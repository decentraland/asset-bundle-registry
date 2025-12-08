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

export interface DbComponent {
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
}

export type QueueMessage = any

export interface QueueComponent {
  send(message: QueueMessage): Promise<void>
  receiveMessages(amount: number): Promise<Message[]>
  deleteMessage(receiptHandle: string): Promise<void>
}

export interface MessageConsumerComponent extends IBaseComponent {}

export interface MessageProcessorComponent {
  process(message: any): Promise<MessageProcessorResult>
}

export interface CatalystComponent {
  getEntityById(id: string, options?: CatalystFetchOptions): Promise<Entity | null>
  getEntitiesByIds(ids: string[], options?: CatalystFetchOptions): Promise<Entity[]>
  getEntityByPointers(pointers: string[]): Promise<Entity[]>
  getContent(id: string): Promise<Entity | undefined>
}

export interface WorldsComponent {
  getWorld(worldId: string, worldContentServerUrl?: string): Promise<Entity | null>
  isWorldDeployment(event: DeploymentToSqs): boolean
}

export interface EventHandlerComponent<T> {
  handle(event: T): Promise<EventHandlerResult>
  canHandle(event: T): boolean
  name: EventHandlerName
}

export interface EntityStatusFetcher {
  fetchBundleManifestData(
    entityId: string,
    platform: string
  ): Promise<{ status: Registry.SimplifiedStatus; version: string; buildDate: string }>
  fetchLODsStatus(entityId: string, platform: string): Promise<Registry.SimplifiedStatus>
}

export interface RegistryOrchestratorComponent {
  persistAndRotateStates(registry: Omit<Registry.DbEntity, 'status'>): Promise<Registry.DbEntity>
}

export interface ICacheStorage extends IBaseComponent {
  get<T>(key: string): Promise<T[]>
  set<T>(key: string, value: T): Promise<void>
  purge(key: string): Promise<void>
  flush(pattern: string): Promise<void>
}

export interface QueuesStatusManagerComponent {
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
