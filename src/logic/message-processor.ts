import { AppComponents, MessageProcessorComponent } from '../types'

export async function createMessageProcessorComponent({
  logs
}: Pick<AppComponents, 'logs' | 'config' | 'metrics'>): Promise<MessageProcessorComponent> {
  const logger = logs.getLogger('message-processor')

  async function process(message: any) {
    logger.info('Message processed', { message: JSON.stringify(message) })
  }

  return { process }
}
