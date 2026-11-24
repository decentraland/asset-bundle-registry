import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { createWorldsAdapter } from '../../../src/adapters/worlds'
import { IWorldsComponent } from '../../../src/types'
import { createConfigMockComponent } from '../mocks/config'
import { createFetchMockComponent } from '../mocks/fetch'
import { createLogMockComponent } from '../mocks/logs'

describe('when checking whether a deployment is a world deployment', () => {
  let worlds: IWorldsComponent
  let event: DeploymentToSqs

  beforeEach(async () => {
    const config = createConfigMockComponent()
    ;(config.requireString as jest.Mock).mockResolvedValue('http://worlds-content-server.internal')
    worlds = await createWorldsAdapter({ config, logs: createLogMockComponent(), fetch: createFetchMockComponent() })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe.each([
    ['the prd worlds server', 'https://worlds-content-server.decentraland.org'],
    ['the dcl.dev worlds server', 'https://worlds-content-server.dcl.dev']
  ])('and it was deployed to %s', (_label: string, contentServerUrl: string) => {
    beforeEach(() => {
      event = { entity: { entityId: 'bafy-world', authChain: [] }, contentServerUrls: [contentServerUrl] }
    })

    it('should be a world deployment', () => {
      expect(worlds.isWorldDeployment(event)).toBe(true)
    })
  })

  describe('and it was deployed to a catalyst', () => {
    beforeEach(() => {
      event = { entity: { entityId: 'bafy-scene', authChain: [] }, contentServerUrls: ['https://dcl.dev/content'] }
    })

    it('should not be a world deployment', () => {
      expect(worlds.isWorldDeployment(event)).toBe(false)
    })
  })
})
