import type {
  IBaseComponent,
  IConfigComponent,
  IFetchComponent,
  IHttpServerComponent,
  ILoggerComponent,
  IMetricsComponent
} from '@well-known-components/interfaces'
import { IPgComponent } from '@dcl/pg-component'
import {
  ICatalystComponent,
  IDbComponent,
  IMessageConsumerComponent,
  IMessageProcessorComponent,
  IQueueComponent,
  IEntityStatusFetcherComponent,
  IRegistryComponent,
  ICacheStorage,
  IWorldsComponent,
  IQueuesStatusManagerComponent,
  IProfileSanitizerComponent,
  IEntityDeploymentTrackerComponent,
  IProfilesCacheComponent,
  IEntityPersisterComponent,
  IProfileRetrieverComponent,
  IFailedProfilesRetrierComponent,
  IProfilesSynchronizerComponent,
  ISynchronizerComponent
} from './service'
import { metricDeclarations } from '../metrics'
import { IContentStorageComponent } from '@dcl/catalyst-storage'
import { ICoordinatesComponent, SpawnCoordinate } from '../logic/coordinates'
import { INatsComponent } from '@well-known-components/nats-component/dist/types'

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
  registry: IRegistryComponent
  queuesStatusManager: IQueuesStatusManagerComponent
  memoryStorage: ICacheStorage
  profileSanitizer: IProfileSanitizerComponent
  profileRetriever: IProfileRetrieverComponent
  synchronizer: ISynchronizerComponent
  coordinates: ICoordinatesComponent
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
  entityDeploymentTracker: IEntityDeploymentTrackerComponent
  profilesCache: IProfilesCacheComponent
  snapshotContentStorage: IContentStorageComponent
  entityPersister: IEntityPersisterComponent
  snapshotsHandler: IProfilesSynchronizerComponent
  pointerChangesHandler: IProfilesSynchronizerComponent
  failedProfilesRetrier: IFailedProfilesRetrierComponent
  ownershipValidatorJob: IBaseComponent
  nats: INatsComponent
}

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
  messageConsumer: IMessageConsumerComponent
  messageProcessor: IMessageProcessorComponent
  worlds: IWorldsComponent
  extendedDb: IDbComponent & {
    deleteHistoricalRegistries: (ids: string[]) => Promise<void>
    deleteProfiles: (pointers: string[]) => Promise<void>
    deleteSpawnCoordinates: (worldNames: string[]) => Promise<void>
    insertSpawnCoordinate: (
      worldName: string,
      x: number,
      y: number,
      isUserSet: boolean,
      timestamp: number
    ) => Promise<void>
    getSpawnCoordinateByWorldName: (worldName: string) => Promise<SpawnCoordinate | null>
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
