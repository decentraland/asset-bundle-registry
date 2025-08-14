import { AppComponents, EventHandlerComponent, EventHandlerName } from '../../../src/types'
import { createLogMockComponent } from '../mocks/logs'
import { createConfigMockComponent } from '../mocks/config'
import { createMessageProcessorComponent } from '../../../src/logic/message-processor'
import { createDeploymentEventHandler } from '../../../src/logic/handlers/deployment-handler'
import { createStatusEventHandler } from '../../../src/logic/handlers/status-handler'
import { createTexturesEventHandler } from '../../../src/logic/handlers/textures-handler'
import { createDbMockComponent } from '../mocks/db'
import { createCatalystMockComponent } from '../mocks/catalyst'
import { createWorldsMockComponent } from '../mocks/worlds'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { AssetBundleConversionFinishedEvent, AssetBundleConversionManuallyQueuedEvent } from '@dcl/schemas'

// Mock the handler modules
jest.mock('../../../src/logic/handlers/deployment-handler')
jest.mock('../../../src/logic/handlers/status-handler')
jest.mock('../../../src/logic/handlers/textures-handler')

describe('message processor', () => {
  const logs = createLogMockComponent()
  const config = createConfigMockComponent()
  ;(config.getNumber as jest.Mock).mockResolvedValue(3) // MAX_RETRIES = 3

  // Create mock handlers
  const deploymentHandler: EventHandlerComponent<DeploymentToSqs> = {
    name: EventHandlerName.DEPLOYMENT,
    handle: jest.fn(),
    canHandle: jest.fn()
  }

  const texturesHandler: EventHandlerComponent<AssetBundleConversionFinishedEvent> = {
    name: EventHandlerName.TEXTURES,
    handle: jest.fn(),
    canHandle: jest.fn()
  }

  const statusHandler: EventHandlerComponent<DeploymentToSqs | AssetBundleConversionManuallyQueuedEvent> = {
    name: EventHandlerName.STATUS,
    handle: jest.fn(),
    canHandle: jest.fn()
  }

  ;(createDeploymentEventHandler as jest.Mock).mockReturnValue(deploymentHandler)
  ;(createStatusEventHandler as jest.Mock).mockReturnValue(statusHandler)
  ;(createTexturesEventHandler as jest.Mock).mockReturnValue(texturesHandler)

  const mockComponents: Pick<
    AppComponents,
    | 'catalyst'
    | 'worlds'
    | 'entityStatusFetcher'
    | 'registryOrchestrator'
    | 'queuesStatusManager'
    | 'db'
    | 'logs'
    | 'config'
  > = {
    catalyst: createCatalystMockComponent(),
    worlds: createWorldsMockComponent(),
    entityStatusFetcher: {
      fetchBundleManifestData: jest.fn(),
      fetchLODsStatus: jest.fn()
    },
    registryOrchestrator: {
      persistAndRotateStates: jest.fn()
    },
    queuesStatusManager: {
      markAsQueued: jest.fn(),
      markAsFinished: jest.fn(),
      getAllPendingEntities: jest.fn()
    },
    db: createDbMockComponent(),
    logs,
    config
  }

  beforeEach(() => {
    jest.clearAllMocks()
    // Reset default behavior for handlers
    ;(deploymentHandler.canHandle as jest.Mock).mockReturnValue(true)
    ;(texturesHandler.canHandle as jest.Mock).mockReturnValue(true)
    ;(statusHandler.canHandle as jest.Mock).mockReturnValue(true)
  })

  describe('when processing messages', () => {
    it('should process message successfully with all handlers', async () => {
      const message = { type: 'deployment', entityId: '123' }
      ;(deploymentHandler.handle as jest.Mock).mockResolvedValue({
        ok: true,
        handlerName: EventHandlerName.DEPLOYMENT
      })
      ;(texturesHandler.handle as jest.Mock).mockResolvedValue({
        ok: true,
        handlerName: EventHandlerName.TEXTURES
      })
      ;(statusHandler.handle as jest.Mock).mockResolvedValue({
        ok: true,
        handlerName: EventHandlerName.STATUS
      })

      const processor = await createMessageProcessorComponent(mockComponents)

      const result = await processor.process(message)

      expect(result.ok).toBe(true)
      expect(result.failedHandlers).toHaveLength(0)
      expect(deploymentHandler.handle).toHaveBeenCalledWith(message)
      expect(texturesHandler.handle).toHaveBeenCalledWith(message)
      expect(statusHandler.handle).toHaveBeenCalledWith(message)
    })

    it('should track failed handlers correctly', async () => {
      const message = { type: 'deployment', entityId: '123' }
      ;(deploymentHandler.handle as jest.Mock).mockResolvedValue({
        ok: true,
        handlerName: EventHandlerName.DEPLOYMENT
      })
      ;(texturesHandler.handle as jest.Mock).mockResolvedValue({
        ok: false,
        handlerName: EventHandlerName.TEXTURES
      })
      ;(statusHandler.handle as jest.Mock).mockResolvedValue({
        ok: true,
        handlerName: EventHandlerName.STATUS
      })

      const processor = await createMessageProcessorComponent(mockComponents)

      const result = await processor.process(message)

      expect(result.ok).toBe(false)
      expect(result.failedHandlers).toEqual([EventHandlerName.TEXTURES])
    })

    describe('retry mechanism', () => {
      it('should only execute non-failed handlers on retry', async () => {
        const message = {
          type: 'deployment',
          entityId: '123',
          retry: {
            attempt: 1,
            failedHandlers: [EventHandlerName.TEXTURES]
          }
        }

        ;(texturesHandler.handle as jest.Mock).mockResolvedValue({
          ok: true,
          handlerName: EventHandlerName.TEXTURES
        })
        ;(deploymentHandler.canHandle as jest.Mock).mockReturnValue(true)
        ;(texturesHandler.canHandle as jest.Mock).mockReturnValue(true)
        ;(statusHandler.canHandle as jest.Mock).mockReturnValue(true)

        const processor = await createMessageProcessorComponent(mockComponents)

        const result = await processor.process(message)

        expect(result.ok).toBe(true)
        expect(result.failedHandlers).toHaveLength(0)
        expect(deploymentHandler.handle).not.toHaveBeenCalled()
        expect(texturesHandler.handle).toHaveBeenCalledWith(message)
        expect(statusHandler.handle).not.toHaveBeenCalled()
      })

      it('should accumulate failed handlers across retries', async () => {
        const message = {
          type: 'deployment',
          entityId: '123',
          retry: {
            attempt: 1,
            failedHandlers: [EventHandlerName.TEXTURES]
          }
        }

        ;(texturesHandler.handle as jest.Mock).mockResolvedValue({
          ok: false,
          handlerName: EventHandlerName.TEXTURES
        })
        ;(deploymentHandler.canHandle as jest.Mock).mockReturnValue(true)
        ;(texturesHandler.canHandle as jest.Mock).mockReturnValue(true)
        ;(statusHandler.canHandle as jest.Mock).mockReturnValue(true)

        const processor = await createMessageProcessorComponent(mockComponents)

        const result = await processor.process(message)

        expect(result.ok).toBe(false)
        expect(result.failedHandlers).toEqual([EventHandlerName.TEXTURES])
        expect(deploymentHandler.handle).not.toHaveBeenCalled()
        expect(texturesHandler.handle).toHaveBeenCalledWith(message)
        expect(statusHandler.handle).not.toHaveBeenCalled()
      })

      it('should stop retrying after max attempts', async () => {
        const message = {
          type: 'deployment',
          entityId: '123',
          retry: {
            attempt: 3, // MAX_RETRIES
            failedHandlers: [EventHandlerName.TEXTURES]
          }
        }

        const processor = await createMessageProcessorComponent(mockComponents)

        const result = await processor.process(message)

        expect(result.ok).toBe(true)
        expect(result.failedHandlers).toHaveLength(0)
        expect(deploymentHandler.handle).not.toHaveBeenCalled()
        expect(texturesHandler.handle).not.toHaveBeenCalled()
        expect(statusHandler.handle).not.toHaveBeenCalled()
      })

      it('should handle all handlers failing', async () => {
        const message = { type: 'deployment', entityId: '123' }
        ;(deploymentHandler.handle as jest.Mock).mockResolvedValue({
          ok: false,
          handlerName: EventHandlerName.DEPLOYMENT
        })
        ;(texturesHandler.handle as jest.Mock).mockResolvedValue({
          ok: false,
          handlerName: EventHandlerName.TEXTURES
        })
        ;(statusHandler.handle as jest.Mock).mockResolvedValue({
          ok: false,
          handlerName: EventHandlerName.STATUS
        })

        const processor = await createMessageProcessorComponent(mockComponents)

        const result = await processor.process(message)

        expect(result.ok).toBe(false)
        expect(result.failedHandlers).toEqual([
          EventHandlerName.DEPLOYMENT,
          EventHandlerName.TEXTURES,
          EventHandlerName.STATUS
        ])
      })

      it('should handle no handlers being able to process the message', async () => {
        const message = { type: 'unknown', entityId: '123' }
        ;(deploymentHandler.canHandle as jest.Mock).mockReturnValue(false)
        ;(texturesHandler.canHandle as jest.Mock).mockReturnValue(false)
        ;(statusHandler.canHandle as jest.Mock).mockReturnValue(false)

        const processor = await createMessageProcessorComponent(mockComponents)

        const result = await processor.process(message)

        expect(result.ok).toBe(true)
        expect(result.failedHandlers).toHaveLength(0)
        expect(deploymentHandler.handle).not.toHaveBeenCalled()
        expect(texturesHandler.handle).not.toHaveBeenCalled()
        expect(statusHandler.handle).not.toHaveBeenCalled()
      })
    })
  })
})
