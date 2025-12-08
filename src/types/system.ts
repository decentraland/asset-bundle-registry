import type {
  IBaseComponent,
  IConfigComponent,
  IFetchComponent,
  IHttpServerComponent,
  ILoggerComponent,
  IMetricsComponent
} from '@well-known-components/interfaces'
import { IPgComponent } from '@well-known-components/pg-component'
import {
  ICatalystComponent,
  IDbComponent,
  IMessageConsumerComponent,
  IMessageProcessorComponent,
  IQueueComponent,
  IEntityStatusFetcherComponent,
  IRegistryOrchestratorComponent,
  ICacheStorage,
  IWorldsComponent,
  IQueuesStatusManagerComponent,
  IProfileSanitizerComponent
} from './service'
import { metricDeclarations } from '../metrics'

export type GlobalContext = {
  components: BaseComponents
}

// components used in every environment
export type BaseComponents = {
  config: IConfigComponent
  fetch: IFetchComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<GlobalContext>
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  db: IDbComponent
  catalyst: ICatalystComponent
  entityStatusFetcher: IEntityStatusFetcherComponent
  registryOrchestrator: IRegistryOrchestratorComponent
  queuesStatusManager: IQueuesStatusManagerComponent
  memoryStorage: ICacheStorage
}

// components used in runtime
export type AppComponents = BaseComponents & {
  pg: IPgComponent
  statusChecks: IBaseComponent
  queue: IQueueComponent
  messageProcessor: IMessageProcessorComponent
  messageConsumer: IMessageConsumerComponent
  workerManager: IBaseComponent
  worlds: IWorldsComponent
  profileSanitizer: IProfileSanitizerComponent
}

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
  messageConsumer: IMessageConsumerComponent
  extendedDb: IDbComponent & {
    deleteHistoricalRegistries: (ids: string[]) => Promise<void>
    close: () => Promise<void>
  }
}

// this type simplifies the typings of http handlers
export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>
