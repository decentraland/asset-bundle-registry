import { ICacheStorage } from '../../../src/types'

export function createMemoryStorageMockComponent(): ICacheStorage {
  return {
    get: jest.fn(),
    set: jest.fn(),
    purge: jest.fn(),
    flush: jest.fn(),
    start: jest.fn(),
    stop: jest.fn()
  }
}
