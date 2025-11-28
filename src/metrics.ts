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
  },
  pointers_per_request: {
    help: 'Histogram of pointers per request',
    type: IMetricsComponent.HistogramType,
    buckets: [1, 5, 10, 20, 50, 100]
  },
  // Metrics required by @dcl/snapshots-fetcher
  // TODO: make them optional
  dcl_content_download_bytes_total: {
    help: 'Total downloaded bytes from other catalysts',
    type: IMetricsComponent.CounterType,
    labelNames: ['remote_server']
  },
  dcl_content_download_duration_seconds: {
    help: 'Total download time from other catalysts',
    type: IMetricsComponent.HistogramType,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    labelNames: ['remote_server']
  },
  dcl_content_download_errors_total: {
    help: 'Total downloaded errors in requests',
    type: IMetricsComponent.CounterType,
    labelNames: ['remote_server']
  },
  dcl_content_download_hash_errors_total: {
    help: 'Total hashing errors in downloaded files',
    type: IMetricsComponent.CounterType,
    labelNames: ['remote_server']
  },
  dcl_entities_deployments_processed_total: {
    help: 'Entities processed from remote catalysts',
    type: IMetricsComponent.CounterType,
    labelNames: ['remote_server', 'source']
  },
  dcl_entities_deployments_streamed_total: {
    help: 'Entities streamed from remote catalysts',
    type: IMetricsComponent.CounterType,
    labelNames: ['remote_server', 'source']
  },
  dcl_catalysts_pointer_changes_response_time_seconds: {
    help: 'Histogram of response time of pointer changes from Catalyst servers in seconds',
    type: IMetricsComponent.HistogramType,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
    labelNames: ['remote_server', 'status_code']
  },
  dcl_deployments_stream_reconnection_count: {
    help: 'Counts the connection of a deployment stream',
    type: IMetricsComponent.CounterType,
    labelNames: ['remote_server']
  },
  dcl_deployments_stream_failure_count: {
    help: 'Counts the failures of a deployment stream',
    type: IMetricsComponent.CounterType,
    labelNames: ['remote_server']
  },
  dcl_content_download_job_succeed_retries: {
    help: 'Summary of how much retries are required for a download job to succeed',
    type: IMetricsComponent.HistogramType,
    buckets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30]
  },
  dcl_available_servers_histogram: {
    help: 'Histogram of available content servers in which a content file is present',
    type: IMetricsComponent.HistogramType,
    buckets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
  },
  dcl_bootstrapping_servers: {
    help: 'Servers that are in bootstrapping state',
    type: IMetricsComponent.GaugeType,
    labelNames: ['from']
  },
  dcl_syncing_servers: {
    help: 'Servers that are in syncing state',
    type: IMetricsComponent.GaugeType
  },
  dcl_processed_snapshots_total: {
    help: 'Total number of processed snapshots that started being streamed',
    type: IMetricsComponent.CounterType,
    labelNames: ['state']
  },
  // Custom profile-specific metrics
  dcl_catalysts_pointer_changes_profiles_fetched: {
    help: 'Total number of profiles fetched from Catalyst servers',
    type: IMetricsComponent.CounterType
  },
  dcl_catalysts_pointer_changes_profiles_inserted: {
    help: 'Total number of new profiles inserted into database',
    type: IMetricsComponent.CounterType
  },
  dcl_catalysts_pointer_changes_profiles_skipped: {
    help: 'Total number of profiles skipped (duplicates or too old)',
    type: IMetricsComponent.CounterType
  },
  dcl_catalysts_pointer_changes_errors: {
    help: 'Total number of errors during pointer changes',
    type: IMetricsComponent.CounterType
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
