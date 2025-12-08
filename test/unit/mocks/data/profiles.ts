import { Entity, EntityType } from '@dcl/schemas'

export function createProfileEntity(overrides: Partial<Entity> = { metadata: {} }): Entity {
  return {
    version: 'v3',
    type: EntityType.PROFILE,
    id: 'test',
    timestamp: 1,
    pointers: ['test'],
    content: [],
    metadata: {
      name: 'test',
      description: 'test',
      image: 'test',
      ...overrides.metadata
    },
    ...overrides
  }
}
