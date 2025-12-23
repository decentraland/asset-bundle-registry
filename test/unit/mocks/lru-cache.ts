import { ILRUNormalizedCache } from '../../../src/adapters/lru-cache'

export function createLRUNormalizedCacheMock(): jest.Mocked<ILRUNormalizedCache<any>> {
  return {
    get: jest.fn(),
    set: jest.fn(),
    has: jest.fn(),
    delete: jest.fn(),
    getMany: jest.fn(),
    setMany: jest.fn(),
    clear: jest.fn(),
    size: jest.fn(),
    maxSize: jest.fn(),
    keys: jest.fn()
  }
}
