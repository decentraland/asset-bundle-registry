import { IHotProfilesCacheComponent } from '../../../src/types'

export function createHotProfilesCacheMockComponent(): jest.Mocked<IHotProfilesCacheComponent> {
  return {
    get: jest.fn(),
    getMany: jest.fn().mockReturnValue(new Map()),
    setIfNewer: jest.fn().mockReturnValue(true),
    setManyIfNewer: jest.fn(),
    has: jest.fn().mockReturnValue(false)
  }
}
