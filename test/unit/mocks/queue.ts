import { QueueComponent } from '../../../src/types'

export function createQueueMockComponent(): QueueComponent {
  return {
    send: jest.fn(),
    receiveSingleMessage: jest.fn(),
    deleteMessage: jest.fn()
  }
}
