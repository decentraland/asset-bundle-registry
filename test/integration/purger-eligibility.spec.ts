import { Registry } from '../../src/types'
import { createRegistryEntity, getIdentity, Identity } from '../utils'
import { test } from '../components'

test('getBatchOfDeprecatedRegistriesOlderThan eligibility', async ({ components }) => {
  let identity: Identity
  const registriesToCleanUp: string[] = []

  beforeAll(async () => {
    identity = await getIdentity()
  })

  afterEach(async () => {
    if (registriesToCleanUp.length > 0) {
      await components.db.deleteRegistries(registriesToCleanUp)
      registriesToCleanUp.length = 0
    }
  })

  afterAll(async () => {
    await components.extendedDb.close()
  })

  const insertWithStatus = async (status: Registry.Status, timestamp: number): Promise<string> => {
    const id = `purger-elig-${status}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`
    const entity = createRegistryEntity(identity.realAccount.address, status, Registry.SimplifiedStatus.COMPLETE, {
      id,
      timestamp
    })
    await components.extendedDb.insertRegistry(entity)
    registriesToCleanUp.push(id)
    return id
  }

  describe('when picking deprecated registries to purge', () => {
    const olderThan = 10_000

    let obsoleteId: string
    let failedId: string
    let completeId: string
    let fallbackId: string
    let pendingId: string

    beforeEach(async () => {
      obsoleteId = await insertWithStatus(Registry.Status.OBSOLETE, 1_000)
      failedId = await insertWithStatus(Registry.Status.FAILED, 2_000)
      completeId = await insertWithStatus(Registry.Status.COMPLETE, 3_000)
      fallbackId = await insertWithStatus(Registry.Status.FALLBACK, 4_000)
      pendingId = await insertWithStatus(Registry.Status.PENDING, 5_000)
    })

    it('returns only obsolete registries', async () => {
      const { registries } = await components.db.getBatchOfDeprecatedRegistriesOlderThan(olderThan, new Set(), 100)

      const ids = registries.map((r) => r.id)
      expect(ids).toContain(obsoleteId)
      expect(ids).not.toContain(failedId)
      expect(ids).not.toContain(completeId)
      expect(ids).not.toContain(fallbackId)
      expect(ids).not.toContain(pendingId)
    })

    it('respects the timestamp filter', async () => {
      const { registries } = await components.db.getBatchOfDeprecatedRegistriesOlderThan(500, new Set(), 100)

      const ids = registries.map((r) => r.id)
      expect(ids).not.toContain(obsoleteId)
    })

    it('respects the excluded ids set', async () => {
      const { registries } = await components.db.getBatchOfDeprecatedRegistriesOlderThan(
        olderThan,
        new Set([obsoleteId.toLowerCase()]),
        100
      )

      const ids = registries.map((r) => r.id)
      expect(ids).not.toContain(obsoleteId)
    })
  })
})
