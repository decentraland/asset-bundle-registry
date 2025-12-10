import { IProfilesCacheComponent } from '../../../src/types'

export function createProfilesCacheMockComponent(): IProfilesCacheComponent {
  return {
    get: jest.fn(),
    getMany: jest.fn(),
    setIfNewer: jest.fn(),
    setManyIfNewer: jest.fn(),
    has: jest.fn(),
    getAllPointers: jest.fn()
  }
}
