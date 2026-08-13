import { InvalidRequestError } from '@dcl/http-commons'
import { MAX_PROFILE_POINTERS_PER_REQUEST, parseProfilePointers } from '../../../../src/controllers/schemas/profiles'

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
})
