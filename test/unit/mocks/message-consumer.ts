import { IMessageConsumerComponent } from '../../../src/types'

export function createMessageConsumerMockComponent(): IMessageConsumerComponent {
  return {
    start: jest.fn(),
    stop: jest.fn()
  }
}
