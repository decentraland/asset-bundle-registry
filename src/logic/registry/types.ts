import { Registry } from '../../types'

/**
 * Categorized related entities for registry status determination.
 */
export type RelatedEntities = {
  newerEntities: Registry.PartialDbEntity[]
  olderEntities: Registry.PartialDbEntity[]
  fallback: Registry.PartialDbEntity | null
}

// Re-export db types for convenience
export type {
  UndeploymentResult,
  SpawnRecalculationParams,
  SpawnRecalculationResult
} from '../../types/service'
