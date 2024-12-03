import { Message } from '@aws-sdk/client-sqs'
import { IBaseComponent } from '@well-known-components/interfaces'
import { Registry } from './types'
import { Entity } from '@dcl/schemas'

export type DbComponent = {
  getRegistry(pointer: string): Promise<Registry>
  upsertRegistry(
    pointer: string,
    newBundle: { version: string; mac: string[]; windows: string[]; timestamp: number }
  ): Promise<Registry>
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
