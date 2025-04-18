import { Message } from '@aws-sdk/client-sqs'
import { IBaseComponent } from '@well-known-components/interfaces'
import {
  CatalystFetchOptions,
  EntityStatusInQueue,
  EventHandlerName,
  MessageProcessorResult,
  EventHandlerResult,
  Registry
} from './types'
import { Entity, EthAddress } from '@dcl/schemas'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'

export type DbComponent = {
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
}

export type QueueMessage = any

export type QueueComponent = {
  send(message: QueueMessage): Promise<void>
  receiveSingleMessage(): Promise<Message[]>
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
  fetchBundleStatus(entityId: string, platform: string): Promise<Registry.SimplifiedStatus>
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
