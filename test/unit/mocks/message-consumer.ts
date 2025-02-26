import { MessageConsumerComponent } from '../../../src/types'

export function createMessageConsumerMockComponent(): MessageConsumerComponent {
  return {
    start: jest.fn(),
    stop: jest.fn()
  }
}
