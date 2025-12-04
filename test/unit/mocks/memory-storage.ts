import { ICacheStorage } from '../../../src/types'

export function createMemoryStorageMockComponent(): jest.Mocked<ICacheStorage> {
  return {
    get: jest.fn().mockResolvedValue([]),
    set: jest.fn().mockResolvedValue(undefined),
    getMany: jest.fn().mockResolvedValue(new Map()),
    setMany: jest.fn().mockResolvedValue(undefined),
    purge: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined)
  } as jest.Mocked<ICacheStorage>
}
