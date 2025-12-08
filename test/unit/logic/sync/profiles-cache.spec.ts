import { ILRUNormalizedCache } from '../../../../src/adapters/lru-cache'
import { IProfilesCacheComponent, Sync } from '../../../../src/types'
import { createLRUNormalizedCacheMock } from '../../mocks/lru-normalized-cache'
import { createProfilesCacheComponent } from '../../../../src/logic/sync/profiles-cache'
import { createProfileEntity } from '../../mocks/data/profiles'
import { Entity } from '@dcl/schemas'

describe('profiles cache', () => {
  let cacheMock: jest.Mocked<ILRUNormalizedCache<Sync.CacheEntry>>
  let component: IProfilesCacheComponent

  beforeEach(() => {
    jest.clearAllMocks()
    cacheMock = createLRUNormalizedCacheMock()
    component = createProfilesCacheComponent(cacheMock)
  })

  describe('when there are no values in the cache', () => {
    beforeEach(() => {
      cacheMock.get.mockReturnValueOnce(undefined)
      cacheMock.getMany.mockReturnValueOnce(new Map())
      cacheMock.keys.mockReturnValueOnce([])
      cacheMock.has.mockReturnValueOnce(false)
    })

    it('getAllPointers should return an empty array', () => {
      const result = component.getAllPointers()
      expect(result).toEqual([])
    })

    it('has should return false', () => {
      const result = component.has('test')
      expect(result).toBe(false)
    })

    it('get should return undefined', () => {
      const result = component.get('test')
      expect(result).toBeUndefined()
    })

    it('getMany should return an empty map', () => {
      const result = component.getMany(['test'])
      expect(result).toEqual(new Map())
    })

    it('setIfNewer should set value and return true', () => {
      const entity = createProfileEntity({ timestamp: 2 })
      const result = component.setIfNewer('test', entity)
      expect(result).toBe(true)
      expect(cacheMock.set).toHaveBeenCalledWith('test', { profile: entity, localTimestamp: expect.any(Number) })
    })

    it('setManyIfNewer should set values and return true', () => {
      const entities = [createProfileEntity({ timestamp: 2 }), createProfileEntity({ timestamp: 3 })]
      component.setManyIfNewer(entities)
      expect(cacheMock.set).toHaveBeenCalledWith('test', { profile: entities[0], localTimestamp: expect.any(Number) })
      expect(cacheMock.set).toHaveBeenCalledWith('test', { profile: entities[1], localTimestamp: expect.any(Number) })
    })
  })

  describe('when there is a value in the cache', () => {
    let idPresent: string
    let pointerPresent: string
    let profilePresent: Entity

    beforeEach(() => {
      idPresent = 'test'
      pointerPresent = 'test'
      profilePresent = createProfileEntity({ id: idPresent, timestamp: 2, pointers: [pointerPresent] })
      cacheMock.get.mockReturnValueOnce({ profile: profilePresent, localTimestamp: 1 })
      cacheMock.getMany.mockReturnValueOnce(new Map([[pointerPresent, { profile: profilePresent, localTimestamp: 1 }]]))
      cacheMock.keys.mockReturnValueOnce(['test'])
      cacheMock.has.mockReturnValueOnce(true)
    })

    it('getAllPointers should return the pointers', () => {
      const result = component.getAllPointers()
      expect(result).toEqual([pointerPresent])
    })

    it('has should return true', () => {
      const result = component.has(idPresent)
      expect(result).toBe(true)
    })

    it('get should return the profile', () => {
      const result = component.get(pointerPresent)
      expect(result).toEqual(profilePresent)
    })

    it('getMany should return the profile', () => {
      const result = component.getMany([pointerPresent])
      expect(result).toEqual(new Map([[pointerPresent, profilePresent]]))
    })
  })

  describe('when there are multiple values in the cache', () => {
    let idPresent1: string
    let idPresent2: string
    let pointerPresent1: string
    let pointerPresent2: string
    let profilePresent1: Entity
    let profilePresent2: Entity

    beforeEach(() => {
      idPresent1 = 'test1'
      idPresent2 = 'test2'
      pointerPresent1 = 'test1'
      pointerPresent2 = 'test2'
      profilePresent1 = createProfileEntity({ id: idPresent1, timestamp: 2, pointers: [pointerPresent1] })
      profilePresent2 = createProfileEntity({ id: idPresent2, timestamp: 2, pointers: [pointerPresent2] })
      cacheMock.get.mockReturnValueOnce({ profile: profilePresent1, localTimestamp: 1 })
      cacheMock.get.mockReturnValueOnce({ profile: profilePresent2, localTimestamp: 1 })
      cacheMock.keys.mockReturnValueOnce(['test1', 'test2'])
      cacheMock.has.mockReturnValueOnce(true)
    })

    it('getAllPointers should return the pointers', () => {
      const result = component.getAllPointers()
      expect(result).toEqual([pointerPresent1, pointerPresent2])
    })

    it('has should return true', () => {
      const result = component.has(idPresent1)
      expect(result).toBe(true)
    })

    it('get should return the profile', () => {
      const result = component.get(pointerPresent1)
      expect(result).toEqual(profilePresent1)
    })

    it('getMany should return the profiles', () => {
      const result = component.getMany([pointerPresent1, pointerPresent2])
      const expected = new Map([
        [pointerPresent1.toLowerCase(), profilePresent1],
        [pointerPresent2.toLowerCase(), profilePresent2]
      ])
      expect(result.size).toBe(expected.size)
      expected.forEach((value, key) => {
        expect(result.get(key)).toEqual(value)
      })
    })
  })
})
