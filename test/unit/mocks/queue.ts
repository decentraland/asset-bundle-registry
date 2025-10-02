import { QueueComponent } from '../../../src/types'

export function createQueueMockComponent(): QueueComponent {
  return {
    send: jest.fn(),
    receiveMessages: jest.fn(),
    deleteMessage: jest.fn()
  }
}
