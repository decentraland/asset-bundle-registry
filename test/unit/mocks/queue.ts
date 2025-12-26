import { IQueueComponent } from '@dcl/sqs-component'

export function createQueueMockComponent(): IQueueComponent {
  return {
    sendMessage: jest.fn(),
    receiveMessages: jest.fn(),
    deleteMessage: jest.fn(),
    deleteMessages: jest.fn(),
    getStatus: jest.fn(),
    changeMessageVisibility: jest.fn(),
    changeMessagesVisibility: jest.fn()
  }
}
