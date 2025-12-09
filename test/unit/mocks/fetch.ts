import { IFetchComponent } from '@well-known-components/interfaces'

export function createFetchMockComponent(): IFetchComponent {
  return {
    fetch: jest.fn()
  }
}
