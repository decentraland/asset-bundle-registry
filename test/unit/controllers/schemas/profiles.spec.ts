import { InvalidRequestError } from '@dcl/http-commons'
import { parseProfilePointers } from '../../../../src/controllers/schemas/profiles'

describe('profile pointers request schema', () => {
  describe('when the body holds an array of pointers', () => {
    it('should return them', () => {
      expect(parseProfilePointers({ ids: ['0x1', 'default5'] })).toEqual(['0x1', 'default5'])
    })
  })

  describe('when the ids property is empty', () => {
    it('should return an empty array', () => {
      expect(parseProfilePointers({ ids: [] })).toEqual([])
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
