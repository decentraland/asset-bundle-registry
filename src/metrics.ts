import { validateMetricsDeclaration } from '@well-known-components/metrics'
import { metricDeclarations as logMetricDeclarations } from '@well-known-components/logger'
import { metricDeclarations as pgMetricDeclarations } from '@well-known-components/pg-component'
import { getDefaultHttpMetrics } from '@well-known-components/http-server'
import { IMetricsComponent } from '@well-known-components/interfaces'

export const metricDeclarations = {
  ...getDefaultHttpMetrics(),
  ...pgMetricDeclarations,
  ...logMetricDeclarations,
  last_worker_run_timestamp: {
    help: 'Timestamp of the last scheduled worker run',
    type: IMetricsComponent.GaugeType
  },
  worker_run_duration_seconds: {
    help: 'Histogram of events processing duration in seconds',
    type: IMetricsComponent.HistogramType,
    buckets: [10, 30, 60, 120, 300, 600]
  },
  registries_ready_count: {
    help: 'Count of registries marked as ready to be returned',
    type: IMetricsComponent.CounterType
  },
  registries_purge_count: {
    help: 'Count of registries purged',
    type: IMetricsComponent.CounterType
  },
  registries_missmatch_count: {
    help: 'Count of registries that have a missmatch',
    type: IMetricsComponent.CounterType
  },
  registries_served_count: {
    help: 'Count of registries successfully served',
    type: IMetricsComponent.CounterType
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
