import { createMessagesConsumerComponent } from '../../../src/logic/message-consumer'
import { createQueueMockComponent } from '../mocks/queue'
import { createMessageProcessorMockComponent } from '../mocks/message-processor'
import { createLogMockComponent } from '../mocks/logs'
import { sleep } from '../../../src/utils/timer'
import { IBaseComponent } from '@well-known-components/interfaces'
import { IMessageConsumerComponent } from '../../../src/types'

jest.mock('../../../src/utils/timer', () => ({
  sleep: jest.fn()
}))

describe('message consumer', () => {
  const queue = createQueueMockComponent()
  const messageProcessor = createMessageProcessorMockComponent()
  const logs = createLogMockComponent()
  let sut: IMessageConsumerComponent

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
      queue.receiveMessages = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: JSON.stringify(message),
            ReceiptHandle: 'receipt-123'
          }
        ])
        .mockResolvedValue([])
      messageProcessor.process = jest.fn().mockResolvedValue({ ok: true, failedHandlers: [] })

      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise

      expect(messageProcessor.process).toHaveBeenCalledWith(message, {})
      expect(queue.deleteMessage).toHaveBeenCalledWith('receipt-123')
      expect(queue.sendMessage).not.toHaveBeenCalled()
    })

    it('should handle failed processing and requeue with retry data', async () => {
      const message = { entityId: '123', type: 'deployment' }
      queue.receiveMessages = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: JSON.stringify(message),
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

      expect(messageProcessor.process).toHaveBeenCalledWith(message, {})
      expect(queue.deleteMessage).toHaveBeenCalledWith('receipt-123')
      expect(queue.sendMessage).toHaveBeenCalledWith(
        {
          ...message,
          retry: {
            attempt: 1,
            failedHandlers: ['TexturesHandler']
          }
        },
        { isRawMessage: true, delaySeconds: 30 }
      )
    })

    it('should handle invalid message format and remove from queue', async () => {
      queue.receiveMessages = jest
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
      expect(queue.sendMessage).not.toHaveBeenCalled()
    })

    it('should handle processor throwing error and remove message from queue', async () => {
      const message = { entityId: '123', type: 'deployment' }
      queue.receiveMessages = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: JSON.stringify(message),
            ReceiptHandle: 'receipt-123'
          }
        ])
        .mockResolvedValue([])
      messageProcessor.process = jest.fn().mockRejectedValue(new Error('Processing failed'))

      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise

      expect(messageProcessor.process).toHaveBeenCalledWith(message, {})
      expect(queue.deleteMessage).toHaveBeenCalledWith('receipt-123')
      expect(queue.sendMessage).not.toHaveBeenCalled()
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
      queue.receiveMessages = jest.fn().mockResolvedValue([])

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
      queue.receiveMessages = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: JSON.stringify(message),
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

      expect(queue.sendMessage).toHaveBeenCalledWith(
        {
          ...message,
          retry: {
            attempt: 2,
            failedHandlers: ['TexturesHandler']
          }
        },
        { isRawMessage: true, delaySeconds: 60 }
      )
    })
  })

  describe('when a message carries the sourceContentServerUrl SQS attribute', () => {
    let message: { type: string; subType: string }

    beforeEach(() => {
      message = { type: 'world', subType: 'world_undeployment' }
      queue.receiveMessages = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: JSON.stringify(message),
            ReceiptHandle: 'receipt-456',
            MessageAttributes: {
              sourceContentServerUrl: { DataType: 'String', StringValue: 'https://worlds-content-server.dcl.dev' }
            }
          }
        ])
        .mockResolvedValue([])
    })

    describe('and the processing succeeds', () => {
      beforeEach(async () => {
        messageProcessor.process = jest.fn().mockResolvedValueOnce({ ok: true, failedHandlers: [] })
        const processPromise = sut.start(mockStartOptions)
        await sut.stop()
        await processPromise
      })

      it('should hand the attribute to the processor', () => {
        expect(messageProcessor.process).toHaveBeenCalledWith(message, {
          sourceContentServerUrl: 'https://worlds-content-server.dcl.dev'
        })
      })
    })

    describe('and the processing fails', () => {
      beforeEach(async () => {
        messageProcessor.process = jest
          .fn()
          .mockResolvedValueOnce({ ok: false, failedHandlers: ['World Undeployment Handler'] })
        const processPromise = sut.start(mockStartOptions)
        await sut.stop()
        await processPromise
      })

      it('should requeue a raw body whose retry data keeps the source', () => {
        expect(queue.sendMessage).toHaveBeenCalledWith(
          {
            ...message,
            retry: {
              attempt: 1,
              failedHandlers: ['World Undeployment Handler'],
              sourceContentServerUrl: 'https://worlds-content-server.dcl.dev'
            }
          },
          { isRawMessage: true, delaySeconds: 30 }
        )
      })
    })
  })

  describe('when a requeued message carries its source in the retry data', () => {
    let message: { type: string; subType: string; retry: Record<string, unknown> }

    beforeEach(async () => {
      message = {
        type: 'world',
        subType: 'world_undeployment',
        retry: {
          attempt: 1,
          failedHandlers: ['World Undeployment Handler'],
          sourceContentServerUrl: 'https://worlds-content-server.dcl.dev'
        }
      }
      queue.receiveMessages = jest
        .fn()
        .mockResolvedValueOnce([{ Body: JSON.stringify(message), ReceiptHandle: 'receipt-789' }])
        .mockResolvedValue([])
      messageProcessor.process = jest.fn().mockResolvedValueOnce({ ok: true, failedHandlers: [] })
      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise
    })

    it('should hand the carried source to the processor', () => {
      expect(messageProcessor.process).toHaveBeenCalledWith(message, {
        sourceContentServerUrl: 'https://worlds-content-server.dcl.dev'
      })
    })
  })

  describe('when a message failed many times', () => {
    let message: { type: string; retry: Record<string, unknown> }

    beforeEach(async () => {
      message = { type: 'deployment', retry: { attempt: 9, failedHandlers: ['Textures Handler'] } }
      queue.receiveMessages = jest
        .fn()
        .mockResolvedValueOnce([{ Body: JSON.stringify(message), ReceiptHandle: 'receipt-1' }])
        .mockResolvedValue([])
      messageProcessor.process = jest.fn().mockResolvedValueOnce({ ok: false, failedHandlers: ['Textures Handler'] })
      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise
    })

    it('should cap the requeue delay at the SQS maximum', () => {
      expect(queue.sendMessage).toHaveBeenCalledWith(expect.anything(), { isRawMessage: true, delaySeconds: 900 })
    })
  })

  describe('when the sourceContentServerUrl attribute has no string value', () => {
    let message: { type: string; subType: string }

    beforeEach(async () => {
      message = { type: 'world', subType: 'world_undeployment' }
      queue.receiveMessages = jest
        .fn()
        .mockResolvedValueOnce([
          {
            Body: JSON.stringify(message),
            ReceiptHandle: 'receipt-2',
            MessageAttributes: { sourceContentServerUrl: { DataType: 'Binary', BinaryValue: new Uint8Array([1]) } }
          }
        ])
        .mockResolvedValue([])
      messageProcessor.process = jest.fn().mockResolvedValueOnce({ ok: true, failedHandlers: [] })
      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise
    })

    it('should hand the processor a null source so the message is dropped', () => {
      expect(messageProcessor.process).toHaveBeenCalledWith(message, { sourceContentServerUrl: null })
    })
  })

  describe('when a first delivery carries a source in its body retry data', () => {
    let message: { type: string; subType: string; retry: Record<string, unknown> }

    beforeEach(async () => {
      message = {
        type: 'world',
        subType: 'world_undeployment',
        retry: { attempt: 0, failedHandlers: [], sourceContentServerUrl: 'https://worlds-content-server.dcl.dev' }
      }
      queue.receiveMessages = jest
        .fn()
        .mockResolvedValueOnce([{ Body: JSON.stringify(message), ReceiptHandle: 'receipt-3' }])
        .mockResolvedValue([])
      messageProcessor.process = jest.fn().mockResolvedValueOnce({ ok: true, failedHandlers: [] })
      const processPromise = sut.start(mockStartOptions)
      await sut.stop()
      await processPromise
    })

    it('should ignore it and treat the message as coming from the default server', () => {
      expect(messageProcessor.process).toHaveBeenCalledWith(message, {})
    })
  })
})
