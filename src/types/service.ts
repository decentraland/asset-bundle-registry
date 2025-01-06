import { Message } from '@aws-sdk/client-sqs'
import { IBaseComponent } from '@well-known-components/interfaces'
import { Registry } from './types'
import { Entity, EthAddress } from '@dcl/schemas'

export type DbComponent = {
  getSortedRegistriesByOwner(owner: EthAddress): Promise<Registry.DbEntity[]>
  getRegistriesByPointers(pointers: string[]): Promise<Registry.DbEntity[]>
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
}

export type QueueMessage = any

export type QueueComponent = {
  send(message: QueueMessage): Promise<void>
  receiveSingleMessage(): Promise<Message[]>
  deleteMessage(receiptHandle: string): Promise<void>
}

export type MessageConsumerComponent = IBaseComponent

export type MessageProcessorComponent = {
  process(message: any): Promise<void>
}

export type CatalystComponent = {
  getEntityById(id: string, contentServerUrl?: string): Promise<Entity>
  getEntityByPointers(pointers: string[]): Promise<Entity[]>
  getContent(id: string): Promise<Entity | undefined>
}

export type EventHandlerComponent = {
  process(event: any): Promise<ProcessorResult>
  canProcess(event: any): boolean
  name: string
}

export type ProcessorResult = {
  ok: boolean
  errors?: string[]
}

export type EntityStatusFetcher = {
  fetchBundleStatus(entityId: string, platform: string): Promise<Registry.SimplifiedStatus>
  fetchLODsStatus(entityId: string, platform: string): Promise<Registry.SimplifiedStatus>
}

export type RegistryOrchestratorComponent = {
  persistAndRotateStates(registry: Omit<Registry.DbEntity, 'status'>): Promise<Registry.DbEntity>
}
