import { EntityType } from '@dcl/schemas'
import { createEntityValidatorComponent } from '../../../src/logic/entity-validator'
import { createLogMockComponent } from '../mocks/logs'
import { IEntityValidatorComponent } from '../../../src/types'

// Valid IPFSv2 hash (59 chars, starts with 'ba')
const VALID_IPFS_HASH = 'bafkreig3u7bhiu37wdlv5v2pk6if36xtkgqzkod35rqd7ay23prnuiphgu'

describe('entity-validator', () => {
  let entityValidator: IEntityValidatorComponent

  beforeEach(() => {
    const logs = createLogMockComponent()
    entityValidator = createEntityValidatorComponent({ logs })
  })

  describe('envelope validation', () => {
    it('should reject an entity with missing required fields', () => {
      const result = entityValidator.validate({})
      expect(result.ok).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it('should reject an entity with invalid version', () => {
      const result = entityValidator.validate({
        version: '1',
        id: VALID_IPFS_HASH,
        type: EntityType.SCENE,
        pointers: ['0,0'],
        timestamp: 1000,
        content: []
      })
      expect(result.ok).toBe(false)
      expect(result.errors!.some((e) => e.includes('envelope'))).toBe(true)
    })

    it('should reject an entity with invalid IPFS hash', () => {
      const result = entityValidator.validate({
        version: 'v3',
        id: 'not-a-valid-hash',
        type: EntityType.SCENE,
        pointers: ['0,0'],
        timestamp: 1000,
        content: []
      })
      expect(result.ok).toBe(false)
    })

    it('should accept a valid entity envelope', () => {
      const result = entityValidator.validate({
        version: 'v3',
        id: VALID_IPFS_HASH,
        type: EntityType.SCENE,
        pointers: ['0,0'],
        timestamp: 1000,
        content: [],
        metadata: null
      })
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
      const result = entityValidator.validate({
        ...validEnvelope,
        type: EntityType.SCENE,
        metadata: { invalid: true }
      })
      expect(result.ok).toBe(false)
      expect(result.errors!.some((e) => e.includes('metadata'))).toBe(true)
    })

    it('should accept a scene entity with valid metadata', () => {
      const result = entityValidator.validate({
        ...validEnvelope,
        type: EntityType.SCENE,
        metadata: {
          main: 'bin/game.js',
          scene: {
            base: '0,0',
            parcels: ['0,0']
          }
        }
      })
      expect(result.ok).toBe(true)
    })

    it('should reject a profile entity with invalid metadata', () => {
      const result = entityValidator.validate({
        ...validEnvelope,
        type: EntityType.PROFILE,
        pointers: ['0x0000000000000000000000000000000000000000'],
        metadata: { invalid: true }
      })
      expect(result.ok).toBe(false)
      expect(result.errors!.some((e) => e.includes('metadata'))).toBe(true)
    })

    it('should accept a profile entity with valid metadata', () => {
      const result = entityValidator.validate({
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
      })
      expect(result.ok).toBe(true)
    })

    it('should skip metadata validation for unknown entity types', () => {
      const result = entityValidator.validate({
        ...validEnvelope,
        type: 'unknown-type',
        metadata: { anything: 'goes' }
      })
      expect(result.ok).toBe(true)
    })

    it('should skip metadata validation when metadata is null', () => {
      const result = entityValidator.validate({
        ...validEnvelope,
        type: EntityType.SCENE,
        metadata: null
      })
      expect(result.ok).toBe(true)
    })

    it('should validate world entities using scene schema', () => {
      const result = entityValidator.validate({
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
      })
      expect(result.ok).toBe(true)
    })

    it('should reject world entities with invalid scene metadata', () => {
      const result = entityValidator.validate({
        ...validEnvelope,
        type: 'world',
        metadata: { invalid: true }
      })
      expect(result.ok).toBe(false)
    })
  })
})
