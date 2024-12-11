import { Message } from '@aws-sdk/client-sqs'
import { IBaseComponent } from '@well-known-components/interfaces'
import { Manifest, Registry } from './types'
import { Entity } from '@dcl/schemas'

export type DbComponent = {
  getRegistriesByPointers(pointers: string[]): Promise<Registry.DbEntity[] | null>
  getRegistryById(id: string): Promise<Registry.DbEntity | null>
  insertRegistry(registry: Registry.DbEntity): Promise<Registry.DbEntity>
  updateRegistryStatus(id: string, status: Registry.StatusValues): Promise<Registry.DbEntity | null>
  upsertRegistryBundle(id: string, platform: string, status: Registry.StatusValues): Promise<Registry.DbEntity | null>
  getRelatedRegistries(registry: Registry.DbEntity): Promise<Registry.PartialDbEntity[] | null>
  deleteRegistries(entityIds: string[]): Promise<void>
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

export type EntityManifestFetcherComponent = {
  downloadManifest(entityId: string, platform: string): Promise<Manifest | null>
}
