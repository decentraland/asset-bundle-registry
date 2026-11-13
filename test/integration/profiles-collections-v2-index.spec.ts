import { EntityType } from '@dcl/schemas'
import { test } from '../components'

function randomHex(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

test('profiles wearing collections-v2 index', async ({ components }) => {
  let collector: string
  let baseOnly: string
  let result: { pointers: string[]; plan: string }

  const insertProfile = async (pointer: string, wearables: string[]): Promise<void> => {
    await components.db.upsertProfileIfNewer({
      id: `bafy${randomHex(40)}`,
      type: EntityType.PROFILE,
      pointer,
      timestamp: Date.now(),
      content: [],
      metadata: { avatars: [{ avatar: { wearables } }] },
      localTimestamp: Date.now()
    })
  }

  beforeEach(async () => {
    collector = `0x${randomHex(40)}`
    baseOnly = `0x${randomHex(40)}`
    await insertProfile(collector, [
      'urn:decentraland:off-chain:base-avatars:eyebrows_00',
      `URN:DECENTRALAND:MATIC:COLLECTIONS-V2:0x${randomHex(40)}:0:1`
    ])
    await insertProfile(baseOnly, [
      'urn:decentraland:off-chain:base-avatars:eyebrows_00',
      'dcl://base-avatars/brown_pants'
    ])
    result = await components.extendedDb.getProfilesWearingCollectionsV2()
  })

  afterEach(async () => {
    await components.extendedDb.deleteProfiles([collector, baseOnly])
  })

  afterAll(async () => {
    await components.extendedDb.close()
  })

  it('should answer the co-wear predicate from the index', () => {
    expect(result.plan).toContain('idx_profiles_wearing_collections_v2')
  })

  it('should include the profile wearing a collections-v2 item, whatever its case', () => {
    expect(result.pointers).toContain(collector.toLowerCase())
  })

  it('should leave out the profile wearing base wearables only', () => {
    expect(result.pointers).not.toContain(baseOnly.toLowerCase())
  })
})
