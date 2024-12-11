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
  CatalystComponent,
  DbComponent,
  EntityManifestFetcherComponent,
  EntityStatusAnalyzerComponent,
  MessageConsumerComponent,
  MessageProcessorComponent,
  QueueComponent
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
  db: DbComponent
}

// components used in runtime
export type AppComponents = BaseComponents & {
  pg: IPgComponent
  statusChecks: IBaseComponent
  queue: QueueComponent
  messageProcessor: MessageProcessorComponent
  catalyst: CatalystComponent
  messageConsumer: MessageConsumerComponent
  entityManifestFetcher: EntityManifestFetcherComponent
  entityStatusAnalyzer: EntityStatusAnalyzerComponent
}

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
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
