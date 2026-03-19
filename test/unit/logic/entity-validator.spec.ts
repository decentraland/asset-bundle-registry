import { Entity, EntityType } from '@dcl/schemas'
import { validateEntity } from '../../../src/logic/entity-validator'
import { createLogMockComponent } from '../mocks/logs'

// Valid IPFSv2 hash (59 chars, starts with 'ba')
const VALID_IPFS_HASH = 'bafkreig3u7bhiu37wdlv5v2pk6if36xtkgqzkod35rqd7ay23prnuiphgu'

describe('entity-validator', () => {
  let logger: ReturnType<typeof createLogMockComponent> extends { getLogger: (name: string) => infer R } ? R : never

  beforeEach(() => {
    const logs = createLogMockComponent()
    logger = logs.getLogger('test')
  })

  describe('envelope validation', () => {
    it('should reject an entity with missing required fields', () => {
      const result = validateEntity({}, logger)
      expect(result.ok).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('should reject an entity with invalid version', () => {
      const result = validateEntity(
        {
          version: '1',
          id: VALID_IPFS_HASH,
          type: EntityType.SCENE,
          pointers: ['0,0'],
          timestamp: 1000,
          content: []
        },
        logger
      )
      expect(result.ok).toBe(false)
      expect(result.errors!.some((e) => e.includes('envelope'))).toBe(true)
    })

    it('should reject an entity with invalid IPFS hash', () => {
      const result = validateEntity(
        {
          version: 'v3',
          id: 'not-a-valid-hash',
          type: EntityType.SCENE,
          pointers: ['0,0'],
          timestamp: 1000,
          content: []
        },
        logger
      )
      expect(result.ok).toBe(false)
    })

    it('should accept a valid entity envelope', () => {
      const result = validateEntity(
        {
          version: 'v3',
          id: VALID_IPFS_HASH,
          type: EntityType.SCENE,
          pointers: ['0,0'],
          timestamp: 1000,
          content: [],
          metadata: null
        },
        logger
      )
      expect(result.ok).toBe(true)
    })
  })

  describe('metadata validation', () => {
    const validEnvelope = {
      version: 'v3',
      id: VALID_IPFS_HASH,
      pointers: ['0,0'],
      timestamp: 1000,
      content: []
    }

    it('should reject a scene entity with invalid metadata', () => {
      const result = validateEntity(
        {
          ...validEnvelope,
          type: EntityType.SCENE,
          metadata: { invalid: true }
        },
        logger
      )
      expect(result.ok).toBe(false)
      expect(result.errors!.some((e) => e.includes('metadata'))).toBe(true)
    })

    it('should accept a scene entity with valid metadata', () => {
      const result = validateEntity(
        {
          ...validEnvelope,
          type: EntityType.SCENE,
          metadata: {
            main: 'bin/game.js',
            scene: {
              base: '0,0',
              parcels: ['0,0']
            }
          }
        },
        logger
      )
      expect(result.ok).toBe(true)
    })

    it('should reject a profile entity with invalid metadata', () => {
      const result = validateEntity(
        {
          ...validEnvelope,
          type: EntityType.PROFILE,
          pointers: ['0x0000000000000000000000000000000000000000'],
          metadata: { invalid: true }
        },
        logger
      )
      expect(result.ok).toBe(false)
      expect(result.errors!.some((e) => e.includes('metadata'))).toBe(true)
    })

    it('should accept a profile entity with valid metadata', () => {
      const result = validateEntity(
        {
          ...validEnvelope,
          type: EntityType.PROFILE,
          pointers: ['0x0000000000000000000000000000000000000000'],
          metadata: {
            avatars: [
              {
                hasClaimedName: false,
                name: 'test',
                ethAddress: '0x0000000000000000000000000000000000000000',
                userId: '0x0000000000000000000000000000000000000000',
                description: '',
                version: 0,
                tutorialStep: 0,
                avatar: {
                  bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseFemale',
                  eyes: { color: { r: 0.5, g: 0.5, b: 0.5 } },
                  hair: { color: { r: 0.3, g: 0.3, b: 0.3 } },
                  skin: { color: { r: 0.8, g: 0.7, b: 0.6 } },
                  wearables: [],
                  snapshots: {
                    face256: VALID_IPFS_HASH,
                    body: VALID_IPFS_HASH
                  }
                }
              }
            ]
          }
        },
        logger
      )
      expect(result.ok).toBe(true)
    })

    it('should skip metadata validation for unknown entity types', () => {
      const result = validateEntity(
        {
          ...validEnvelope,
          type: 'unknown-type',
          metadata: { anything: 'goes' }
        },
        logger
      )
      expect(result.ok).toBe(true)
    })

    it('should skip metadata validation when metadata is null', () => {
      const result = validateEntity(
        {
          ...validEnvelope,
          type: EntityType.SCENE,
          metadata: null
        },
        logger
      )
      expect(result.ok).toBe(true)
    })

    it('should validate world entities using scene schema', () => {
      const result = validateEntity(
        {
          ...validEnvelope,
          type: 'world',
          metadata: {
            main: 'bin/game.js',
            scene: {
              base: '0,0',
              parcels: ['0,0']
            },
            worldConfiguration: {
              name: 'my-world.dcl.eth'
            }
          }
        },
        logger
      )
      expect(result.ok).toBe(true)
    })

    it('should reject world entities with invalid scene metadata', () => {
      const result = validateEntity(
        {
          ...validEnvelope,
          type: 'world',
          metadata: { invalid: true }
        },
        logger
      )
      expect(result.ok).toBe(false)
    })
  })
})
