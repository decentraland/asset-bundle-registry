import { InvalidRequestError } from '@dcl/http-commons'
import {
  MAX_NAME_POINTERS_PER_REQUEST,
  MAX_PROFILE_POINTERS_PER_REQUEST,
  parseProfilePointers
} from '../../../../src/controllers/schemas/profiles'

describe('profile pointers request schema', () => {
  describe('when the body holds an array of pointers', () => {
    it('should return them', () => {
      expect(parseProfilePointers({ ids: ['0x1', 'default5'] })).toEqual(['0x1', 'default5'])
    })
  })

  describe('when the ids property is missing', () => {
    it('should throw an invalid request error', () => {
      expect(() => parseProfilePointers({})).toThrow(InvalidRequestError)
    })
  })

  describe('when the ids property is not an array', () => {
    it('should throw an invalid request error', () => {
      expect(() => parseProfilePointers({ ids: '0x1' })).toThrow(InvalidRequestError)
    })
  })

  describe('when the ids property holds a value that is not a string', () => {
    it('should throw an invalid request error', () => {
      expect(() => parseProfilePointers({ ids: ['0x1', 42] })).toThrow(InvalidRequestError)
    })
  })

  describe('when the ids property holds an empty string', () => {
    it('should throw an invalid request error', () => {
      expect(() => parseProfilePointers({ ids: [''] })).toThrow(InvalidRequestError)
    })
  })

  describe('when more pointers than the limit are requested', () => {
    let ids: string[]

    beforeEach(() => {
      ids = Array.from({ length: MAX_PROFILE_POINTERS_PER_REQUEST + 1 }, (_, index) => `0x${index}`)
    })

    it('should throw an invalid request error naming the limit', () => {
      expect(() => parseProfilePointers({ ids })).toThrow(
        `A maximum of ${MAX_PROFILE_POINTERS_PER_REQUEST} ids can be requested at once, got ${ids.length}`
      )
    })
  })

  describe('when exactly the limit is requested', () => {
    let ids: string[]

    beforeEach(() => {
      ids = Array.from({ length: MAX_PROFILE_POINTERS_PER_REQUEST }, (_, index) => `0x${index}`)
    })

    it('should return them', () => {
      expect(parseProfilePointers({ ids })).toHaveLength(MAX_PROFILE_POINTERS_PER_REQUEST)
    })
  })

  describe('when more default profile names than their limit are requested', () => {
    let ids: string[]

    beforeEach(() => {
      ids = Array.from({ length: MAX_NAME_POINTERS_PER_REQUEST + 1 }, (_, index) => `default${index}`)
    })

    it('should throw an invalid request error naming the limit', () => {
      expect(() => parseProfilePointers({ ids })).toThrow(
        `A maximum of ${MAX_NAME_POINTERS_PER_REQUEST} default profile ids can be requested at once, got ${ids.length}`
      )
    })
  })

  describe('when exactly the default profile name limit is requested', () => {
    let ids: string[]

    beforeEach(() => {
      ids = Array.from({ length: MAX_NAME_POINTERS_PER_REQUEST }, (_, index) => `default${index}`)
    })

    it('should return them', () => {
      expect(parseProfilePointers({ ids })).toHaveLength(MAX_NAME_POINTERS_PER_REQUEST)
    })
  })

  describe('when many addresses are requested alongside a few default profile names', () => {
    let ids: string[]

    beforeEach(() => {
      ids = [
        ...Array.from({ length: 400 }, (_, index) => `0x${index.toString().padStart(40, '0')}`),
        'default1',
        'default2'
      ]
    })

    it('should return them, since only the names are limited', () => {
      expect(parseProfilePointers({ ids })).toHaveLength(ids.length)
    })
  })
})
