import { createRequestMaker, getIdentity, Identity } from '../utils'
import { test } from '../components'

test('Denylist endpoints', function ({ components }) {
  let identity: Identity
  let fetchLocally: ReturnType<typeof createRequestMaker>['makeLocalRequest']
  const denylistToCleanUp: string[] = []

  beforeAll(async function () {
    const { makeLocalRequest } = createRequestMaker(components)
    fetchLocally = makeLocalRequest
    identity = await getIdentity()
  })

  afterEach(async function () {
    jest.resetAllMocks()
    if (denylistToCleanUp.length > 0) {
      await components.extendedDb.deleteDenylistEntries([...denylistToCleanUp])
      denylistToCleanUp.length = 0
    }
  })

  afterAll(async function () {
    await components.extendedDb.close()
  })

  describe('GET /denylist', function () {
    describe('when the denylist is empty', function () {
      it('should return an empty array', async function () {
        const response = await fetchLocally('GET', '/denylist', undefined as any, undefined)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual([])
      })
    })

    describe('when there are entries in the denylist', function () {
      const entityId = 'qmtestentityfordenylistget'

      beforeEach(async function () {
        await components.db.addDenylistEntry(entityId, '0xabcdef1234567890abcdef1234567890abcdef12', 'test reason')
        denylistToCleanUp.push(entityId)
      })

      it('should return the existing entries', async function () {
        const response = await fetchLocally('GET', '/denylist', undefined as any, undefined)
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              entity_id: entityId,
              reason: 'test reason'
            })
          ])
        )
      })
    })
  })

  describe('POST /denylist/:entityId', function () {
    describe('when the request is not authenticated', function () {
      it('should reject with an auth error', async function () {
        const response = await fetchLocally('POST', '/denylist/QmSomeEntity', undefined as any, undefined)

        expect(response.status).toBeGreaterThanOrEqual(400)
      })
    })

    describe('when the signer is not a moderator', function () {
      beforeEach(function () {
        ;(components.refreshableFeatures.getUserModerators as jest.Mock).mockResolvedValue([])
      })

      it('should return 403 Forbidden', async function () {
        const response = await fetchLocally('POST', '/denylist/QmSomeEntity', identity, { reason: 'test' })
        const body = await response.json()

        expect(response.status).toBe(403)
        expect(body.ok).toBe(false)
      })
    })

    describe('when the signer is a moderator', function () {
      beforeEach(function () {
        ;(components.refreshableFeatures.getUserModerators as jest.Mock).mockResolvedValue([
          identity.realAccount.address.toLowerCase()
        ])
      })

      describe('and the entity is not yet in the denylist', function () {
        const entityId = 'QmTestEntityDenylistPost'

        afterEach(async function () {
          denylistToCleanUp.push(entityId.toLowerCase())
        })

        it('should add the entity and return 201', async function () {
          const response = await fetchLocally('POST', `/denylist/${entityId}`, identity, { reason: 'bad content' })
          const body = await response.json()

          expect(response.status).toBe(201)
          expect(body).toMatchObject({
            entity_id: entityId.toLowerCase(),
            reason: 'bad content',
            created_by: identity.realAccount.address.toLowerCase()
          })
        })
      })

      describe('and the entity is already in the denylist', function () {
        const entityId = 'QmTestEntityDenylistUpsert'

        beforeEach(async function () {
          await components.db.addDenylistEntry(entityId, identity.realAccount.address, 'original reason')
          denylistToCleanUp.push(entityId.toLowerCase())
        })

        it('should upsert and return 201 with updated values', async function () {
          const response = await fetchLocally('POST', `/denylist/${entityId}`, identity, { reason: 'updated reason' })
          const body = await response.json()

          expect(response.status).toBe(201)
          expect(body.reason).toBe('updated reason')
        })
      })
    })
  })

  describe('DELETE /denylist/:entityId', function () {
    describe('when the request is not authenticated', function () {
      it('should reject with an auth error', async function () {
        const response = await fetchLocally('DELETE', '/denylist/QmSomeEntity', undefined as any, undefined)

        expect(response.status).toBeGreaterThanOrEqual(400)
      })
    })

    describe('when the signer is not a moderator', function () {
      beforeEach(function () {
        ;(components.refreshableFeatures.getUserModerators as jest.Mock).mockResolvedValue([])
      })

      it('should return 403 Forbidden', async function () {
        const response = await fetchLocally('DELETE', '/denylist/QmSomeEntity', identity, undefined)
        const body = await response.json()

        expect(response.status).toBe(403)
        expect(body.ok).toBe(false)
      })
    })

    describe('when the signer is a moderator', function () {
      beforeEach(function () {
        ;(components.refreshableFeatures.getUserModerators as jest.Mock).mockResolvedValue([
          identity.realAccount.address.toLowerCase()
        ])
      })

      describe('and the entity is not in the denylist', function () {
        it('should return 404', async function () {
          const response = await fetchLocally('DELETE', '/denylist/QmEntityNotInDenylist', identity, undefined)
          const body = await response.json()

          expect(response.status).toBe(404)
          expect(body.ok).toBe(false)
        })
      })

      describe('and the entity is in the denylist', function () {
        const entityId = 'QmTestEntityDenylistDelete'

        beforeEach(async function () {
          await components.db.addDenylistEntry(entityId, identity.realAccount.address, 'to delete')
        })

        it('should remove the entity and return 200', async function () {
          const response = await fetchLocally('DELETE', `/denylist/${entityId}`, identity, undefined)
          const body = await response.json()

          expect(response.status).toBe(200)
          expect(body.ok).toBe(true)
        })

        it('should no longer appear in GET /denylist after deletion', async function () {
          await fetchLocally('DELETE', `/denylist/${entityId}`, identity, undefined)

          const getResponse = await fetchLocally('GET', '/denylist', undefined as any, undefined)
          const list = await getResponse.json()

          expect(list.find((e: any) => e.entity_id === entityId.toLowerCase())).toBeUndefined()
        })
      })
    })
  })
})
