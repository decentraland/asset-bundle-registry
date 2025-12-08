import { IQueueComponent } from '../../../src/types'

export function createQueueMockComponent(): IQueueComponent {
  return {
    send: jest.fn(),
    receiveMessages: jest.fn(),
    deleteMessage: jest.fn()
  }
}
