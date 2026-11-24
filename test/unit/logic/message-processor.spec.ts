import { AppComponents, IEventHandlerComponent, EventHandlerName } from '../../../src/types'
import { createLogMockComponent } from '../mocks/logs'
import { createConfigMockComponent } from '../mocks/config'
import { createMessageProcessorComponent } from '../../../src/logic/message-processor'
import { createDeploymentEventHandler } from '../../../src/logic/handlers/deployment-handler'
import { createStatusEventHandler } from '../../../src/logic/handlers/status-handler'
import { createTexturesEventHandler } from '../../../src/logic/handlers/textures-handler'
import { createDbMockComponent } from '../mocks/db'
import { createCatalystMockComponent } from '../mocks/catalyst'
import { createWorldsMockComponent } from '../mocks/worlds'
import { createRegistryMockComponent } from '../mocks/registry'
import { createCoordinatesMockComponent } from '../mocks/coordinates'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { AssetBundleConversionFinishedEvent, AssetBundleConversionManuallyQueuedEvent } from '@dcl/schemas'
import { createTestMetricsComponent } from '@dcl/metrics'
import { metricDeclarations } from '../../../src/metrics'

// Mock the handler modules
jest.mock('../../../src/logic/handlers/deployment-handler')
jest.mock('../../../src/logic/handlers/status-handler')
jest.mock('../../../src/logic/handlers/textures-handler')

describe('message processor', () => {
  const logs = createLogMockComponent()
  const config = createConfigMockComponent()
  ;(config.getNumber as jest.Mock).mockResolvedValue(3) // MAX_RETRIES = 3
  ;(config.requireString as jest.Mock).mockResolvedValue('peer.decentraland.org') // ALLOWED_CONTENT_SERVER_HOSTS

  // Create mock handlers
  const deploymentHandler: IEventHandlerComponent<DeploymentToSqs> = {
    name: EventHandlerName.DEPLOYMENT,
    handle: jest.fn(),
    canHandle: jest.fn()
  }

  const texturesHandler: IEventHandlerComponent<AssetBundleConversionFinishedEvent> = {
    name: EventHandlerName.TEXTURES,
    handle: jest.fn(),
    canHandle: jest.fn()
  }

  const statusHandler: IEventHandlerComponent<DeploymentToSqs | AssetBundleConversionManuallyQueuedEvent> = {
    name: EventHandlerName.STATUS,
    handle: jest.fn(),
    canHandle: jest.fn()
  }

  ;(createDeploymentEventHandler as jest.Mock).mockReturnValue(deploymentHandler)
  ;(createStatusEventHandler as jest.Mock).mockReturnValue(statusHandler)
  ;(createTexturesEventHandler as jest.Mock).mockReturnValue(texturesHandler)

  const mockComponents: Pick<
    AppComponents,
    'catalyst' | 'worlds' | 'registry' | 'queuesStatusManager' | 'db' | 'logs' | 'config' | 'metrics'
  > & { coordinates: ReturnType<typeof createCoordinatesMockComponent> } = {
    catalyst: createCatalystMockComponent(),
    worlds: createWorldsMockComponent(),
    registry: createRegistryMockComponent(),
    coordinates: createCoordinatesMockComponent(),
    queuesStatusManager: {
      markAsQueued: jest.fn(),
      markAsFinished: jest.fn(),
      getAllPendingEntities: jest.fn()
    },
    db: createDbMockComponent(),
    logs,
    config,
    metrics: createTestMetricsComponent(metricDeclarations)
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
      expect(deploymentHandler.handle).toHaveBeenCalledWith(message, { sourceContentServerUrl: null })
      expect(texturesHandler.handle).toHaveBeenCalledWith(message, { sourceContentServerUrl: null })
      expect(statusHandler.handle).toHaveBeenCalledWith(message, { sourceContentServerUrl: null })
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
        expect(texturesHandler.handle).toHaveBeenCalledWith(message, { sourceContentServerUrl: null })
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
        expect(texturesHandler.handle).toHaveBeenCalledWith(message, { sourceContentServerUrl: null })
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

  describe('when the message is a deployment with an off-allowlist content-server host', () => {
    it('should drop the message before any handler runs, so no handler creates an orphaned entry', async () => {
      const message = {
        entity: { entityId: '123', authChain: [] },
        contentServerUrls: ['https://evil.internal/ssrf']
      }

      const processor = await createMessageProcessorComponent(mockComponents)

      const result = await processor.process(message)

      expect(result.ok).toBe(true)
      expect(deploymentHandler.handle).not.toHaveBeenCalled()
      expect(texturesHandler.handle).not.toHaveBeenCalled()
      expect(statusHandler.handle).not.toHaveBeenCalled()
    })
  })

  describe('when the message carries a sourceContentServerUrl attribute', () => {
    let message: Record<string, unknown>
    let processor: Awaited<ReturnType<typeof createMessageProcessorComponent>>
    let result: Awaited<ReturnType<typeof processor.process>>
    let incrementSpy: jest.SpyInstance

    beforeEach(async () => {
      message = { type: 'world', subType: 'world_undeployment', metadata: { worldName: 'test-world' } }
      ;(config.getString as jest.Mock).mockImplementation(async (key: string) => {
        switch (key) {
          case 'ALLOWED_WORLDS_CONTENT_SERVER_HOSTS':
            return 'worlds-content-server.dcl.dev'
          case 'WORLDS_CONTENT_SERVER_URL':
            return 'http://worlds-content-server.internal'
          case 'WORLDS_CONTENT_SERVER_PUBLIC_URL':
            return 'https://worlds-content-server.decentraland.org'
          default:
            return undefined
        }
      })
      ;(deploymentHandler.canHandle as jest.Mock).mockReturnValue(false)
      ;(statusHandler.canHandle as jest.Mock).mockReturnValue(false)
      ;(texturesHandler.handle as jest.Mock).mockResolvedValue({ ok: true, handlerName: EventHandlerName.TEXTURES })
      incrementSpy = jest.spyOn(mockComponents.metrics, 'increment')
      processor = await createMessageProcessorComponent(mockComponents)
    })

    afterEach(() => {
      ;(config.getString as jest.Mock).mockReset()
      incrementSpy.mockRestore()
    })

    describe('and the attribute is an allowlisted bare origin with mixed case and a trailing slash', () => {
      beforeEach(async () => {
        result = await processor.process(message, { sourceContentServerUrl: 'HTTPS://Worlds-Content-Server.DCL.dev/' })
      })

      it('should hand the handlers the normalised origin as the event source', () => {
        expect(texturesHandler.handle).toHaveBeenCalledWith(message, {
          sourceContentServerUrl: 'https://worlds-content-server.dcl.dev'
        })
      })

      it('should report the message as processed', () => {
        expect(result).toEqual({ ok: true, failedHandlers: [] })
      })
    })

    describe('and the attribute carries a path', () => {
      beforeEach(async () => {
        result = await processor.process(message, {
          sourceContentServerUrl: 'https://worlds-content-server.dcl.dev/worlds-content-server'
        })
      })

      it('should drop the message without running any handler', () => {
        expect(texturesHandler.handle).not.toHaveBeenCalled()
      })

      it('should count the drop with the not_bare_origin reason', () => {
        expect(incrementSpy).toHaveBeenCalledWith('world_events_dropped_total', { reason: 'not_bare_origin' })
      })
    })

    describe('and the attribute is the default worlds server origin', () => {
      beforeEach(async () => {
        result = await processor.process(message, {
          sourceContentServerUrl: 'https://worlds-content-server.decentraland.org'
        })
      })

      it('should hand the handlers the default worlds server as the event source', () => {
        expect(texturesHandler.handle).toHaveBeenCalledWith(message, { sourceContentServerUrl: null })
      })
    })

    describe('and the attribute host is not allowlisted', () => {
      beforeEach(async () => {
        result = await processor.process(message, { sourceContentServerUrl: 'https://worlds.evil.example' })
      })

      it('should drop the message without running any handler', () => {
        expect(texturesHandler.handle).not.toHaveBeenCalled()
      })

      it('should report the message as processed so it is not retried', () => {
        expect(result).toEqual({ ok: true, failedHandlers: [] })
      })

      it('should log the drop at error level', () => {
        expect(logs.getLogger('message-processor').error).toHaveBeenCalledWith(
          'Dropping world event: its source content server is not accepted',
          expect.objectContaining({ reason: 'not_allowlisted' })
        )
      })

      it('should count the drop with the not_allowlisted reason', () => {
        expect(incrementSpy).toHaveBeenCalledWith('world_events_dropped_total', { reason: 'not_allowlisted' })
      })
    })

    describe('and the attribute is not an https URL', () => {
      beforeEach(async () => {
        result = await processor.process(message, { sourceContentServerUrl: 'http://worlds-content-server.dcl.dev' })
      })

      it('should drop the message without running any handler', () => {
        expect(texturesHandler.handle).not.toHaveBeenCalled()
      })
    })

    describe('and the attribute key had no string value', () => {
      beforeEach(async () => {
        result = await processor.process(message, { sourceContentServerUrl: null })
      })

      it('should drop the message without running any handler', () => {
        expect(texturesHandler.handle).not.toHaveBeenCalled()
      })

      it('should count the drop with the malformed reason', () => {
        expect(incrementSpy).toHaveBeenCalledWith('world_events_dropped_total', { reason: 'malformed' })
      })
    })

    describe('and the message is a deployment fetched from another origin', () => {
      beforeEach(async () => {
        message = {
          entity: { entityId: 'bafy-world', authChain: [] },
          contentServerUrls: ['https://worlds-content-server.decentraland.org']
        }
        ;(deploymentHandler.canHandle as jest.Mock).mockReturnValue(true)
        result = await processor.process(message, { sourceContentServerUrl: 'https://worlds-content-server.dcl.dev' })
      })

      it('should drop the message without running any handler', () => {
        expect(deploymentHandler.handle).not.toHaveBeenCalled()
      })

      it('should count the drop with the source_mismatch reason', () => {
        expect(incrementSpy).toHaveBeenCalledWith('world_events_dropped_total', { reason: 'source_mismatch' })
      })
    })

    describe('and the message is a deployment fetched from the attribute origin', () => {
      beforeEach(async () => {
        message = {
          entity: { entityId: 'bafy-world', authChain: [] },
          contentServerUrls: ['https://worlds-content-server.dcl.dev']
        }
        ;(deploymentHandler.canHandle as jest.Mock).mockReturnValue(true)
        ;(deploymentHandler.handle as jest.Mock).mockResolvedValue({
          ok: true,
          handlerName: EventHandlerName.DEPLOYMENT
        })
        result = await processor.process(message, { sourceContentServerUrl: 'https://worlds-content-server.dcl.dev' })
      })

      it('should run the deployment handler with the attribute as the event source', () => {
        expect(deploymentHandler.handle).toHaveBeenCalledWith(message, {
          sourceContentServerUrl: 'https://worlds-content-server.dcl.dev'
        })
      })
    })
  })

  describe('when the message has no sourceContentServerUrl attribute', () => {
    let message: { type: string; subType: string; metadata: { worldName: string } }

    beforeEach(async () => {
      message = { type: 'world', subType: 'world_undeployment', metadata: { worldName: 'test-world' } }
      ;(deploymentHandler.canHandle as jest.Mock).mockReturnValue(false)
      ;(statusHandler.canHandle as jest.Mock).mockReturnValue(false)
      ;(texturesHandler.handle as jest.Mock).mockResolvedValue({ ok: true, handlerName: EventHandlerName.TEXTURES })
      const processor = await createMessageProcessorComponent(mockComponents)
      await processor.process(message)
    })

    it('should hand the handlers the default worlds server as the event source', () => {
      expect(texturesHandler.handle).toHaveBeenCalledWith(message, { sourceContentServerUrl: null })
    })
  })
})
