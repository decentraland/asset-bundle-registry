import { IMessageProcessorComponent } from '../../../src/types'

export function createMessageProcessorMockComponent(): IMessageProcessorComponent {
  return {
    process: jest.fn()
  }
}
