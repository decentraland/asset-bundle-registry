import { Entity, EntityType, Profile, Avatar, AvatarInfo } from '@dcl/schemas'
import { Sync } from '../../../../src/types'

export function createAvatarInfo(overrides: Partial<AvatarInfo> = {}): AvatarInfo {
  return {
    bodyShape: 'dcl://base-avatars/BaseFemale',
    eyes: { color: { r: 0.5, g: 0.5, b: 0.5 } },
    hair: { color: { r: 0.3, g: 0.3, b: 0.3 } },
    skin: { color: { r: 0.8, g: 0.7, b: 0.6 } },
    wearables: [],
    forceRender: [],
    emotes: [],
    snapshots: { face256: '', body: '' },
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
    ...overrides
  } as Avatar
}

export function createFullAvatar(overrides: Partial<Avatar> = {}): Avatar {
  return createAvatar({
    avatar: createAvatarInfo(),
    ...overrides
  })
}

export function createProfileEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    version: 'v3',
    type: EntityType.PROFILE,
    id: 'bafkreitest',
    timestamp: 1,
    pointers: ['0x0000000000000000000000000000000000000000'],
    content: [],
    metadata: { avatars: [createAvatar()] },
    ...overrides
  }
}

export function createProfileDbEntity(overrides: Partial<Sync.ProfileDbEntity> = {}): Sync.ProfileDbEntity {
  return {
    id: 'bafkreitest',
    type: EntityType.PROFILE,
    pointer: '0x0000000000000000000000000000000000000000',
    timestamp: 1,
    localTimestamp: 1,
    content: [],
    metadata: { avatars: [createAvatar()] },
    ...overrides
  }
}

export function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    avatars: [createAvatar()],
    ...overrides
  }
}

export function createFailedProfileDbEntity(
  overrides: Partial<Sync.FailedProfileDbEntity> = {}
): Sync.FailedProfileDbEntity {
  return {
    entityId: 'bafkreitest',
    pointer: '0x0000000000000000000000000000000000000000',
    timestamp: 1,
    authChain: [],
    firstFailedAt: 1,
    retryCount: 0,
    ...overrides
  }
}
