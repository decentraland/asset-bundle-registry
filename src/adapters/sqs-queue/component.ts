import { ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { createSqsComponent } from '@dcl/sqs-component'
import { ReceiveMessagesOptions } from '@dcl/core-commons'
import { AppComponents, SOURCE_CONTENT_SERVER_URL_ATTRIBUTE } from '../../types'
import { ISqsQueueComponent } from './types'

/**
 * Creates the SQS queue adapter.
 *
 * Wraps `@dcl/sqs-component`, whose `receiveMessages` does not request message attributes, and
 * replaces `receiveMessages` so each message carries the `sourceContentServerUrl` attribute
 * (with raw delivery, SNS message attributes arrive as SQS message attributes, but only when
 * asked for). Every other operation is the library's.
 *
 * @param components - config (AWS_SQS_QUEUE_URL, optional AWS_SQS_ENDPOINT)
 * @returns The queue component
 */
export async function createSqsQueueComponent({ config }: Pick<AppComponents, 'config'>): Promise<ISqsQueueComponent> {
  const queueUrl = await config.requireString('AWS_SQS_QUEUE_URL')
  const endpoint = await config.getString('AWS_SQS_ENDPOINT')
  const base = await createSqsComponent(config)
  const client = new SQSClient(endpoint ? { endpoint } : {})

  /**
   * Receives up to `amount` messages, including the `sourceContentServerUrl` attribute.
   *
   * @param amount - Max messages to receive (SQS caps it at 10)
   * @param options - Visibility timeout, long-poll wait and abort signal
   * @returns The received SQS messages
   */
  async function receiveMessages(amount: number = 1, options?: ReceiveMessagesOptions): Promise<any[]> {
    const { Messages = [] } = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: amount,
        VisibilityTimeout: options?.visibilityTimeout ?? 60,
        WaitTimeSeconds: options?.waitTimeSeconds ?? 20,
        MessageAttributeNames: [SOURCE_CONTENT_SERVER_URL_ATTRIBUTE]
      }),
      { abortSignal: options?.abortSignal }
    )
    return Messages
  }

  return { ...base, receiveMessages }
}
