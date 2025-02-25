import { createMessagesConsumerComponent } from '../../../src/logic/message-consumer'
import { createQueueMockComponent } from '../mocks/queue'
import { createMessageProcessorMockComponent } from '../mocks/message-processor'
import { createLogMockComponent } from '../mocks/logs'
import { sleep } from '../../../src/utils/timer'
import { IBaseComponent } from '@well-known-components/interfaces'
import { MessageConsumerComponent } from '../../../src/types'

jest.mock('../../../src/utils/timer', () => ({
  sleep: jest.fn()
}))

describe('message consumer', () => {
  const queue = createQueueMockComponent()
  const messageProcessor = createMessageProcessorMockComponent()
  const logs = createLogMockComponent()
  let sut: MessageConsumerComponent

  const mockStartOptions: IBaseComponent.ComponentStartOptions = {
    started: jest.fn(),
    live: jest.fn(),
    getComponents: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    sut = createMessagesConsumerComponent({ queue, messageProcessor, logs })
  })

  afterEach(async () => {
    await sut.stop()
  })

  describe('when processing messages', () => {
    it('should process message successfully and remove it from queue', async () => {
      const message = { entityId: '123', type: 'deployment' }
      queue.receiveSingleMessage = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: JSON.stringify({ Message: JSON.stringify(message) }),
            ReceiptHandle: 'receipt-123'
          }
        ])
        .mockResolvedValue([])
      messageProcessor.process = jest.fn().mockResolvedValue({ ok: true, failedHandlers: [] })

      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise

      expect(messageProcessor.process).toHaveBeenCalledWith(message)
      expect(queue.deleteMessage).toHaveBeenCalledWith('receipt-123')
      expect(queue.send).not.toHaveBeenCalled()
    })

    it('should handle failed processing and requeue with retry data', async () => {
      const message = { entityId: '123', type: 'deployment' }
      queue.receiveSingleMessage = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: JSON.stringify({ Message: JSON.stringify(message) }),
            ReceiptHandle: 'receipt-123'
          }
        ])
        .mockResolvedValue([])
      messageProcessor.process = jest.fn().mockResolvedValue({
        ok: false,
        failedHandlers: ['TexturesHandler']
      })

      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise

      expect(messageProcessor.process).toHaveBeenCalledWith(message)
      expect(queue.deleteMessage).toHaveBeenCalledWith('receipt-123')
      expect(queue.send).toHaveBeenCalledWith({
        MessageBody: JSON.stringify({
          ...message,
          retry: {
            attempt: 1,
            failedHandlers: ['TexturesHandler']
          }
        }),
        DelaySeconds: 0
      })
    })

    it('should handle invalid message format and remove from queue', async () => {
      queue.receiveSingleMessage = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: 'invalid-json',
            ReceiptHandle: 'receipt-123'
          }
        ])
        .mockResolvedValue([])

      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise

      expect(messageProcessor.process).not.toHaveBeenCalled()
      expect(queue.deleteMessage).toHaveBeenCalledWith('receipt-123')
      expect(queue.send).not.toHaveBeenCalled()
    })

    it('should handle processor throwing error and remove message from queue', async () => {
      const message = { entityId: '123', type: 'deployment' }
      queue.receiveSingleMessage = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: JSON.stringify({ Message: JSON.stringify(message) }),
            ReceiptHandle: 'receipt-123'
          }
        ])
        .mockResolvedValue([])
      messageProcessor.process = jest.fn().mockRejectedValue(new Error('Processing failed'))

      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise

      expect(messageProcessor.process).toHaveBeenCalledWith(message)
      expect(queue.deleteMessage).toHaveBeenCalledWith('receipt-123')
      expect(queue.send).not.toHaveBeenCalled()
      expect(logs.getLogger().error).toHaveBeenCalledWith(
        'Failed while processing message from queue',
        expect.objectContaining({
          messageHandle: 'receipt-123',
          entityId: 'unknown',
          error: 'Processing failed'
        })
      )
    })

    it('should wait when no messages are available', async () => {
      queue.receiveSingleMessage = jest.fn().mockResolvedValue([])

      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise

      expect(sleep).toHaveBeenCalledWith(5000) // 5 seconds wait
      expect(messageProcessor.process).not.toHaveBeenCalled()
    })

    it('should increment retry attempt for previously failed messages', async () => {
      const message = {
        entityId: '123',
        type: 'deployment',
        retry: {
          attempt: 1,
          failedHandlers: ['TexturesHandler']
        }
      }
      queue.receiveSingleMessage = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: JSON.stringify({ Message: JSON.stringify(message) }),
            ReceiptHandle: 'receipt-123'
          }
        ])
        .mockResolvedValue([])
      messageProcessor.process = jest.fn().mockResolvedValue({
        ok: false,
        failedHandlers: ['TexturesHandler']
      })

      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise

      expect(queue.send).toHaveBeenCalledWith({
        MessageBody: JSON.stringify({
          ...message,
          retry: {
            attempt: 2,
            failedHandlers: ['TexturesHandler']
          }
        }),
        DelaySeconds: 0
      })
    })
  })
})
