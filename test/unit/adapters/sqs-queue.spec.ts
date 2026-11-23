import { ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { createSqsComponent } from '@dcl/sqs-component'
import { IConfigComponent } from '@well-known-components/interfaces'
import { createSqsQueueComponent, ISqsQueueComponent } from '../../../src/adapters/sqs-queue'
import { createConfigMockComponent } from '../mocks/config'

jest.mock('@dcl/sqs-component')

describe('when receiving messages from the SQS queue adapter', () => {
  let config: IConfigComponent
  let sendSpy: jest.SpyInstance
  let queue: ISqsQueueComponent
  let messages: any[]

  beforeEach(async () => {
    config = createConfigMockComponent()
    ;(config.requireString as jest.Mock).mockResolvedValueOnce('https://sqs.example/queue')
    ;(config.getString as jest.Mock).mockResolvedValueOnce(undefined)
    ;(createSqsComponent as jest.Mock).mockResolvedValueOnce({ sendMessage: jest.fn(), deleteMessage: jest.fn() })
    sendSpy = jest
      .spyOn(SQSClient.prototype, 'send')
      .mockResolvedValueOnce({ Messages: [{ Body: '{}', ReceiptHandle: 'receipt-1' }] } as never)
    queue = await createSqsQueueComponent({ config })
    messages = await queue.receiveMessages(10)
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
  })

  it('should request the sourceContentServerUrl message attribute', () => {
    const command: ReceiveMessageCommand = sendSpy.mock.calls[0][0]

    expect(command.input).toEqual(
      expect.objectContaining({
        QueueUrl: 'https://sqs.example/queue',
        MaxNumberOfMessages: 10,
        MessageAttributeNames: ['sourceContentServerUrl']
      })
    )
  })

  it('should return the received messages', () => {
    expect(messages).toEqual([{ Body: '{}', ReceiptHandle: 'receipt-1' }])
  })
})
