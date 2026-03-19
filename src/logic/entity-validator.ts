import { Entity, EntityType, Scene, Wearable, Emote, Profile } from '@dcl/schemas'
import { BaseComponents, IEntityValidatorComponent, EntityValidationResult } from '../types'

const metadataValidators: Record<string, { validate: (data: any) => boolean }> = {
  [EntityType.SCENE]: Scene,
  [EntityType.WEARABLE]: Wearable,
  [EntityType.EMOTE]: Emote,
  [EntityType.PROFILE]: Profile
}

/**
 * Worlds are scenes deployed to world content servers. The worlds adapter
 * tags them with type 'world' (not part of EntityType enum), but their
 * metadata follows the Scene schema.
 */
function getMetadataValidator(entityType: string): { validate: (data: any) => boolean } | undefined {
  if (entityType === 'world') {
    return metadataValidators[EntityType.SCENE]
  }
  return metadataValidators[entityType]
}

export function createEntityValidatorComponent({ logs }: Pick<BaseComponents, 'logs'>): IEntityValidatorComponent {
  const logger = logs.getLogger('entity-validator')

  function validate(entity: unknown): EntityValidationResult {
    const data = entity as Record<string, any>
    const entityId = data?.id || 'unknown'

    // Step 1: Validate the Entity envelope (id, version, type, pointers, timestamp, content)
    if (!Entity.validate(entity)) {
      const envelopeErrors = (Entity.validate.errors || []).map((e) => `envelope${e.instancePath}: ${e.message}`)
      logger.error('Entity failed envelope validation', {
        entityId,
        errors: JSON.stringify(envelopeErrors)
      })
      return { ok: false, errors: envelopeErrors }
    }

    // Step 2: Validate metadata against the type-specific schema
    if (entity.metadata) {
      const validator = getMetadataValidator(entity.type)
      if (validator) {
        if (!validator.validate(entity.metadata)) {
          const metadataErrors = ((validator.validate as any).errors || []).map(
            (e: any) => `metadata${e.instancePath}: ${e.message}`
          )
          logger.error('Entity failed metadata validation', {
            entityId: entity.id,
            entityType: entity.type,
            errors: JSON.stringify(metadataErrors)
          })
          return { ok: false, errors: metadataErrors }
        }
      }
    }

    return { ok: true }
  }

  return {
    validate
  }
}
