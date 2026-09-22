import { EntityType } from '@dcl/schemas'
import { ItemCoOccurrenceRow } from '../../src/types'
import { test } from '../components'

const NINETY_ONE_DAYS_MS = 91 * 24 * 60 * 60 * 1000

function randomHex(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('')
}

test('item_co_occurrence view', async ({ components }) => {
  let pointers: string[]
  let collection: string
  let hat: string
  let jacket: string
  let boots: string
  let rows: ItemCoOccurrenceRow[]

  const insertProfile = async (wearables: string[], timestamp = Date.now()): Promise<void> => {
    const pointer = `0x${randomHex(40)}`
    pointers.push(pointer)
    await components.db.upsertProfileIfNewer({
      id: `bafy${randomHex(40)}`,
      type: EntityType.PROFILE,
      pointer,
      timestamp,
      content: [],
      metadata: { avatars: [{ avatar: { wearables } }] },
      localTimestamp: Date.now()
    })
  }

  const insertProfiles = async (count: number, wearables: (index: number) => string[], timestamp?: number) => {
    for (let index = 0; index < count; index++) {
      await insertProfile(wearables(index), timestamp)
    }
  }

  beforeEach(() => {
    pointers = []
    collection = `0x${randomHex(40)}`
    hat = `urn:decentraland:matic:collections-v2:${collection}:0`
    jacket = `urn:decentraland:matic:collections-v2:${collection}:1`
    boots = `urn:decentraland:matic:collections-v2:${collection}:2`
  })

  afterEach(async () => {
    await components.extendedDb.deleteProfiles(pointers)
  })

  afterAll(async () => {
    await components.extendedDb.close()
  })

  describe('when enough profiles wear two items together with their token ids', () => {
    beforeEach(async () => {
      await insertProfiles(5, (index) => [
        `${hat}:${100 + index}`,
        `${jacket.toUpperCase()}:${200 + index}`,
        'urn:decentraland:off-chain:base-avatars:eyebrows_00',
        'dcl://base-avatars/brown_pants'
      ])
      rows = await components.extendedDb.getItemCoOccurrencesInvolving([hat, jacket])
    })

    it('should count both items as the same item across token ids, in both directions', () => {
      expect(rows).toEqual([
        expect.objectContaining({ item_a: hat, item_b: jacket, n_ab: '5', n_a: '5', n_b: '5', cosine: 1 }),
        expect.objectContaining({ item_a: jacket, item_b: hat, n_ab: '5', n_a: '5', n_b: '5', cosine: 1 })
      ])
    })
  })

  describe('when profiles wear an item together with base wearables only', () => {
    let baseRows: ItemCoOccurrenceRow[]

    beforeEach(async () => {
      await insertProfiles(5, () => [
        `${hat}:1`,
        'urn:decentraland:off-chain:base-avatars:eyebrows_00',
        'URN:DECENTRALAND:OFF-CHAIN:BASE-AVATARS:BaseMale',
        'dcl://base-avatars/brown_pants'
      ])
      rows = await components.extendedDb.getItemCoOccurrencesInvolving([hat])
      baseRows = await components.extendedDb.getItemCoOccurrencesLike('%base-avatars%')
    })

    it('should not pair the item with any base wearable', () => {
      expect(rows).toEqual([])
    })

    it('should not include base wearables in any pair', () => {
      expect(baseRows).toEqual([])
    })
  })

  describe('when fewer profiles than the minimum support wear two items together', () => {
    beforeEach(async () => {
      await insertProfiles(4, (index) => [`${hat}:${index}`, `${jacket}:${index}`])
      rows = await components.extendedDb.getItemCoOccurrencesInvolving([hat, jacket])
    })

    it('should not include the pair', () => {
      expect(rows).toEqual([])
    })
  })

  describe('when the profiles wearing two items together were deployed outside the active window', () => {
    beforeEach(async () => {
      await insertProfiles(5, (index) => [`${hat}:${index}`, `${jacket}:${index}`], Date.now() - NINETY_ONE_DAYS_MS)
      rows = await components.extendedDb.getItemCoOccurrencesInvolving([hat, jacket])
    })

    it('should not include the pair', () => {
      expect(rows).toEqual([])
    })
  })

  describe('when an item is worn with one partner more exclusively than with another', () => {
    let partnersByScore: string[]

    beforeEach(async () => {
      await insertProfiles(5, (index) => [`${hat}:${index}`, `${jacket}:${index}`, `${boots}:${index}`])
      await insertProfiles(5, (index) => [`${boots}:${10 + index}`])
      rows = await components.extendedDb.getItemCoOccurrencesInvolving([hat])
      partnersByScore = rows
        .filter((row) => row.item_a === hat)
        .sort((a, b) => b.cosine - a.cosine)
        .map((row) => row.item_b)
    })

    it('should score the exclusive partner above the more popular one', () => {
      expect(partnersByScore).toEqual([jacket, boots])
    })
  })
})
