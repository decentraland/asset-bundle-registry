import {
  AppComponents,
  IMessageConsumerComponent,
  MessageAttributes,
  MessageProcessorResult,
  SOURCE_CONTENT_SERVER_URL_ATTRIBUTE
} from '../types'
import { sleep } from '../utils/timer'

const RETRY_BASE_DELAY_SECONDS = 30
const MAX_SQS_DELAY_SECONDS = 900

export function createMessagesConsumerComponent({
  logs,
  queue,
  messageProcessor
}: Pick<AppComponents, 'logs' | 'queue' | 'messageProcessor'>): IMessageConsumerComponent {
  const logger = logs.getLogger('messages-consumer')
  const intervalToWaitInSeconds = 5 // wait time when no messages are found in the queue
  let isRunning = false
  let loopPromise: Promise<void> | null = null

  /**
   * Reads the transport attributes of a message: the SQS message attribute, or on a requeued message
   * (retry.attempt >= 1) the copy carried in the body's retry data. A key present without a string
   * value yields null so the processor drops the message instead of treating it as the default server.
   */
  function getMessageAttributes(message: any, parsedMessage: any): MessageAttributes {
    const attributes = message.MessageAttributes
    if (attributes && Object.prototype.hasOwnProperty.call(attributes, SOURCE_CONTENT_SERVER_URL_ATTRIBUTE)) {
      const value = attributes[SOURCE_CONTENT_SERVER_URL_ATTRIBUTE]?.StringValue
      return { sourceContentServerUrl: typeof value === 'string' ? value : null }
    }
    const retry = parsedMessage?.retry
    if (typeof retry?.attempt === 'number' && retry.attempt >= 1 && retry.sourceContentServerUrl !== undefined) {
      const value = retry.sourceContentServerUrl
      return { sourceContentServerUrl: typeof value === 'string' ? value : null }
    }
    return {}
  }

  /** Requeue delay: exponential from RETRY_BASE_DELAY_SECONDS, capped at the SQS maximum. */
  function getRetryDelaySeconds(attempt: number): number {
    return Math.min(RETRY_BASE_DELAY_SECONDS * 2 ** (attempt - 1), MAX_SQS_DELAY_SECONDS)
  }

  async function removeMessageFromQueue(messageHandle: string) {
    logger.info('Removing message from queue', { messageHandle })
    await queue.deleteMessage(messageHandle)
  }

  async function consumeLoop() {
    while (isRunning) {
      const messages = await queue.receiveMessages(10)

      if (!messages || messages.length === 0) {
        logger.debug(`No messages found in queue, waiting ${intervalToWaitInSeconds} seconds to check again`)
        await sleep(intervalToWaitInSeconds * 1000)
        continue
      }

      for (const message of messages) {
        const { Body, ReceiptHandle } = message
        let parsedMessage: any | undefined

        try {
          parsedMessage = JSON.parse(Body!)

          if (!parsedMessage) {
            logger.warn('Message is not a valid event or could not be parsed', { parsedMessage })
            await removeMessageFromQueue(ReceiptHandle!)
            continue
          }
        } catch (error: any) {
          logger.error('Failed while parsing message from queue', {
            messageHandle: ReceiptHandle!,
            error: error?.message || 'Unexpected failure'
          })
          await removeMessageFromQueue(ReceiptHandle!)
          continue
        }

        try {
          const attributes = getMessageAttributes(message, parsedMessage)
          const result: MessageProcessorResult = await messageProcessor.process(parsedMessage, attributes)
          await removeMessageFromQueue(ReceiptHandle!)

          if (!result.ok) {
            const attempt = (parsedMessage.retry?.attempt || 0) + 1
            const messageToRequeue = {
              ...parsedMessage,
              retry: {
                attempt,
                failedHandlers: result.failedHandlers,
                ...(typeof attributes.sourceContentServerUrl === 'string'
                  ? { sourceContentServerUrl: attributes.sourceContentServerUrl }
                  : {})
              }
            }

            // Raw body: the subscription uses raw delivery and this loop parses Body as the event.
            await queue.sendMessage(messageToRequeue, {
              isRawMessage: true,
              delaySeconds: getRetryDelaySeconds(attempt)
            })
          }
        } catch (error: any) {
          logger.error('Failed while processing message from queue', {
            messageHandle: ReceiptHandle!,
            entityId: parsedMessage?.key || 'unknown',
            error: error?.message || 'Unexpected failure'
          })
          logger.debug('Failed while processing message from queue', {
            stack: JSON.stringify(error?.stack)
          })
          // TODO: Add a retry mechanism OR DLQ
          await removeMessageFromQueue(ReceiptHandle!)
        }
      }
    }
  }

  async function start() {
    logger.info('Starting to listen messages from queue')
    isRunning = true
    loopPromise = consumeLoop()
  }

  async function stop() {
    isRunning = false
    if (loopPromise) {
      await loopPromise
    }
  }

  return {
    start,
    stop
  }
}
