import { Entity, EntityType, Profile, Avatar } from '@dcl/schemas'
import { Sync } from '../../../../src/types'

export function createProfileDbEntity(
  overrides: Partial<Sync.ProfileDbEntity> = { metadata: {}, type: EntityType.PROFILE }
): Sync.ProfileDbEntity {
  return {
    id: 'test',
    type: EntityType.PROFILE,
    pointer: 'test',
    timestamp: 1,
    localTimestamp: 1,
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

export function createAvatar(overrides: Partial<Avatar> = {}): Avatar {
  return {
    hasClaimedName: false,
    name: 'test',
    ethAddress: '0x0000000000000000000000000000000000000000',
    userId: '',
    description: '',
    version: 0,
    tutorialStep: 0,
    avatar: {
      bodyShape: 'dcl://base-avatars/BaseFemale',
      eyes: {
        color: {
          r: 0.5,
          g: 0.5,
          b: 0.5
        }
      },
      hair: {
        color: {
          r: 0.3,
          g: 0.3,
          b: 0.3
        }
      },
      skin: {
        color: {
          r: 0.8,
          g: 0.7,
          b: 0.6
        }
      },
      wearables: [],
      forceRender: [],
      emotes: [],
      snapshots: {
        face256: '',
        body: ''
      }
    },
    ...overrides
  }
}

export function createProfile(overrides: Partial<Profile> = {}): Profile {
  const defaultAvatar = createAvatar(overrides.avatars?.[0])
  return {
    avatars: overrides.avatars || [defaultAvatar],
    ...overrides
  }
}
