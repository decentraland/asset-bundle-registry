import { getDenylistHandler } from '../../../src/controllers/handlers/get-denylist'
import { postDenylistEntryHandler } from '../../../src/controllers/handlers/post-denylist-entry'
import { deleteDenylistEntryHandler } from '../../../src/controllers/handlers/delete-denylist-entry'

function createDbMock() {
  return {
    getDenylist: jest.fn(),
    addDenylistEntry: jest.fn(),
    removeDenylistEntry: jest.fn()
  }
}

function createRefreshableFeaturesMock(moderators: string[] | null = null) {
  return {
    getUserModerators: jest.fn().mockResolvedValue(moderators)
  }
}

function makeContext(overrides: Record<string, any> = {}) {
  return {
    components: {
      db: createDbMock(),
      refreshableFeatures: createRefreshableFeaturesMock()
    },
    params: { entityId: 'QmTestEntity' },
    url: new URL('http://localhost/denylist'),
    request: { json: jest.fn().mockResolvedValue({}) },
    verification: { auth: '0xabcdef1234567890abcdef1234567890abcdef12' },
    ...overrides
  }
}

describe('getDenylistHandler', function () {
  describe('when the db returns entries', function () {
    it('should return them in the body', async function () {
      const entries = [{ entity_id: 'qmfoo', reason: null, created_by: '0xabc', created_at: 0, updated_at: 0 }]
      const ctx = makeContext()
      ctx.components.db.getDenylist.mockResolvedValueOnce(entries)

      const result = await getDenylistHandler(ctx as any)

      expect(result).toEqual({ body: entries })
    })
  })
})

describe('postDenylistEntryHandler', function () {
  describe('when entityId param is missing', function () {
    it('should return 400', async function () {
      const ctx = makeContext({ params: { entityId: '' } })

      const result = await postDenylistEntryHandler(ctx as any)

      expect(result.status).toBe(400)
    })
  })

  describe('when the signer is not a moderator', function () {
    it('should return 403', async function () {
      const ctx = makeContext({
        components: {
          db: createDbMock(),
          refreshableFeatures: createRefreshableFeaturesMock([])
        }
      })

      const result = await postDenylistEntryHandler(ctx as any)

      expect(result.status).toBe(403)
    })
  })

  describe('when the signer is a moderator', function () {
    it('should call addDenylistEntry and return 201', async function () {
      const signerAddress = '0xabcdef1234567890abcdef1234567890abcdef12'
      const entry = {
        entity_id: 'qmtestentity',
        reason: 'bad',
        created_by: signerAddress,
        created_at: 1,
        updated_at: 1
      }
      const ctx = makeContext({
        components: {
          db: createDbMock(),
          refreshableFeatures: createRefreshableFeaturesMock([signerAddress.toLowerCase()])
        },
        request: { json: jest.fn().mockResolvedValue({ reason: 'bad' }) }
      })
      ctx.components.db.addDenylistEntry.mockResolvedValueOnce(entry)

      const result = await postDenylistEntryHandler(ctx as any)

      expect(result.status).toBe(201)
      expect(result.body).toEqual(entry)
      expect(ctx.components.db.addDenylistEntry).toHaveBeenCalledWith('QmTestEntity', signerAddress, 'bad')
    })
  })
})

describe('deleteDenylistEntryHandler', function () {
  describe('when entityId param is missing', function () {
    it('should return 400', async function () {
      const ctx = makeContext({ params: { entityId: '' } })

      const result = await deleteDenylistEntryHandler(ctx as any)

      expect(result.status).toBe(400)
    })
  })

  describe('when the signer is not a moderator', function () {
    it('should return 403', async function () {
      const ctx = makeContext({
        components: {
          db: createDbMock(),
          refreshableFeatures: createRefreshableFeaturesMock([])
        }
      })

      const result = await deleteDenylistEntryHandler(ctx as any)

      expect(result.status).toBe(403)
    })
  })

  describe('when the signer is a moderator', function () {
    const signerAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

    describe('and the entity is not found in the denylist', function () {
      it('should return 404', async function () {
        const ctx = makeContext({
          components: {
            db: createDbMock(),
            refreshableFeatures: createRefreshableFeaturesMock([signerAddress.toLowerCase()])
          }
        })
        ctx.components.db.removeDenylistEntry.mockResolvedValueOnce(false)

        const result = await deleteDenylistEntryHandler(ctx as any)

        expect(result.status).toBe(404)
      })
    })

    describe('and the entity is in the denylist', function () {
      it('should remove it and return 200', async function () {
        const ctx = makeContext({
          components: {
            db: createDbMock(),
            refreshableFeatures: createRefreshableFeaturesMock([signerAddress.toLowerCase()])
          }
        })
        ctx.components.db.removeDenylistEntry.mockResolvedValueOnce(true)

        const result = await deleteDenylistEntryHandler(ctx as any)

        expect(result.status).toBe(200)
        expect((result.body as any).ok).toBe(true)
      })
    })
  })
})
