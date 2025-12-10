import { AuthLinkType, Avatar, Entity, EntityType } from '@dcl/schemas'
import { createAvatar } from './profiles'

/* Snapshots fetcher implementation of pointer changes response
 * ensures that the hash must pass in order to be streamed:
 * const baHash = await hashV1(file as any)
 *
 * Required fields by PointerChangesSyncDeployment schema:
 * - entityId, entityType, pointers, localTimestamp, entityTimestamp, authChain
 */
export function createValidPointerChangesResponse(
  overrides: Partial<{
    entityId: string
    entityType: EntityType
    pointers: string[]
    entityTimestamp: number
    localTimestamp: number
    metadata: { avatars: Avatar[] }
    authChain: Array<{ type: string; payload: string; signature?: string }>
  }> = {}
) {
  return {
    entityType: EntityType.PROFILE,
    entityId: 'bafkreig3u7bhiu37wdlv5v2pk6if36xtkgqzkod35rqd7ay23prnuiphgu',
    pointers: ['0xd02bb8968f95a29e512c6e0aff5888d045e5b527'],
    entityTimestamp: 1765316352001,
    localTimestamp: 1765316352002,
    authChain: [
      {
        type: AuthLinkType.SIGNER,
        payload: '0xd02bb8968f95a29e512c6e0aff5888d045e5b527',
        signature: ''
      }
    ],
    metadata: { avatars: [createAvatar()] },
    ...overrides
  }
}

export function parseToEntity(pointerChanges: any): Entity {
  return {
    version: 'v3',
    type: EntityType.PROFILE,
    id: pointerChanges.entityId,
    pointers: pointerChanges.pointers,
    timestamp: pointerChanges.entityTimestamp,
    metadata: pointerChanges.metadata,
    content: []
  }
}
