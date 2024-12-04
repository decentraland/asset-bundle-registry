import { AssetBundleConvertedEvent } from '@dcl/schemas'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { AppComponents, MessageProcessorComponent } from '../types'
import { createDeploymentProcessor } from './processors/deployment-processor'
import { createTexturesProcessor } from './processors/textures-processor'

export async function createMessageProcessorComponent({
  catalyst,
  db,
  logs
}: Pick<AppComponents, 'catalyst' | 'db' | 'logs' | 'config' | 'metrics'>): Promise<MessageProcessorComponent> {
  const log = logs.getLogger('message-processor')
  const deploymentProcessor = createDeploymentProcessor({ db, catalyst, logs })
  const texturesProcessor = createTexturesProcessor({ db, logs })

  async function process(message: any) {
    log.debug('Processing', { message })
    ;(DeploymentToSqs.validate(message) && (await deploymentProcessor.process(message))) ||
      (AssetBundleConvertedEvent.validate(message) && (await texturesProcessor.process(message)))
  }

  return { process }
}
