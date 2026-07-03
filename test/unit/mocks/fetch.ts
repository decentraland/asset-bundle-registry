import { IFetchComponent } from '@dcl/core-commons'

export function createFetchMockComponent(): IFetchComponent {
  return {
    fetch: jest.fn()
  }
}
