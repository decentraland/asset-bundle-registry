import { MessageProcessorComponent } from '../../../src/types'

export function createMessageProcessorMockComponent(): MessageProcessorComponent {
  return {
    process: jest.fn()
  }
}
