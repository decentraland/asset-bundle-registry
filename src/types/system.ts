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
  MessageConsumerComponent,
  MessageProcessorComponent,
  QueueComponent,
  EntityStatusFetcher,
  RegistryOrchestratorComponent,
  ICacheStorage,
  WorldsComponent,
  QueuesStatusManagerComponent,
  ProfilesDbComponent,
  HotProfilesCacheComponent,
  ProfileDedupCacheComponent,
  ProfileEntitiesBloomFilterComponent,
  ProfileSnapshotStorageComponent,
  ProfileDeployerComponent,
  ProfileSynchronizerComponent,
  ProfileRetrieverComponent,
  SnapshotContentStorageComponent
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
  catalyst: CatalystComponent
  entityStatusFetcher: EntityStatusFetcher
  registryOrchestrator: RegistryOrchestratorComponent
  queuesStatusManager: QueuesStatusManagerComponent
  memoryStorage: ICacheStorage
  profileRetriever: ProfileRetrieverComponent
}

// components used in runtime
export type AppComponents = BaseComponents & {
  pg: IPgComponent
  statusChecks: IBaseComponent
  queue: QueueComponent
  messageProcessor: MessageProcessorComponent
  messageConsumer: MessageConsumerComponent
  workerManager: IBaseComponent
  worlds: WorldsComponent
  profilesDb: ProfilesDbComponent
  hotProfilesCache: HotProfilesCacheComponent
  profileDedupCache: ProfileDedupCacheComponent
  profileEntitiesBloomFilter: ProfileEntitiesBloomFilterComponent
  profileSnapshotStorage: ProfileSnapshotStorageComponent
  profileDeployer: ProfileDeployerComponent
  profileSynchronizer: ProfileSynchronizerComponent & IBaseComponent
  snapshotContentStorage: SnapshotContentStorageComponent
}

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
  messageConsumer: MessageConsumerComponent
  extendedDb: DbComponent & {
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
