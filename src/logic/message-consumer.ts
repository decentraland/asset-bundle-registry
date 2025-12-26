import { AppComponents, IMessageConsumerComponent, MessageProcessorResult } from '../types'
import { sleep } from '../utils/timer'

export function createMessagesConsumerComponent({
  logs,
  queue,
  messageProcessor
}: Pick<AppComponents, 'logs' | 'queue' | 'messageProcessor'>): IMessageConsumerComponent {
  const logger = logs.getLogger('messages-consumer')
  const intervalToWaitInSeconds = 5 // wait time when no messages are found in the queue
  let isRunning = false

  async function removeMessageFromQueue(messageHandle: string) {
    logger.info('Removing message from queue', { messageHandle })
    await queue.deleteMessage(messageHandle)
  }

  async function start() {
    logger.info('Starting to listen messages from queue')
    isRunning = true
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
          const result: MessageProcessorResult = await messageProcessor.process(parsedMessage)
          await removeMessageFromQueue(ReceiptHandle!)

          if (!result.ok) {
            const messageToRequeue = {
              ...parsedMessage,
              retry: {
                attempt: (parsedMessage.retry?.attempt || 0) + 1,
                failedHandlers: result.failedHandlers
              }
            }

            await queue.sendMessage(messageToRequeue)
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

  async function stop() {
    isRunning = false
  }

  return {
    start,
    stop
  }
}
