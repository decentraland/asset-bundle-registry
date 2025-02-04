import { initComponents } from '../components'
import { createItemsProcessor } from './items'
import { createScenesProcessor } from './scenes'

enum Action {
  SCENES = 'scenes',
  ITEMS = 'items'
}

async function main() {
  const components = await initComponents()
  const logger = components.logs.getLogger('scripts')
  const scenesProcessor = await createScenesProcessor(components)
  const itemsProcessor = await createItemsProcessor(components)

  // first argument is the action
  const action = process.argv[2]
  const filePath = process.argv[3]

  switch (action) {
    case Action.SCENES:
      await scenesProcessor.process()
      break
    case Action.ITEMS:
      await itemsProcessor.process(filePath)
      break
    default:
      logger.error(`Unknown action: ${action}`)
      process.exit(1)
  }
}

main().catch(console.error)
