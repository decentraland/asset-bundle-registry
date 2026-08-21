import { IConfigComponent } from '@well-known-components/interfaces'
import { setupRouter } from '../../../src/controllers/routes'
import { GlobalContext } from '../../../src/types'
import { createConfigMockComponent } from '../mocks/config'

describe('routes', () => {
  let config: IConfigComponent
  let globalContext: GlobalContext
  let registeredPaths: string[]

  beforeEach(() => {
    config = createConfigMockComponent()
    globalContext = {
      components: { config, fetch: { fetch: jest.fn() } }
    } as unknown as GlobalContext
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when profiles are not disabled', () => {
    beforeEach(async () => {
      ;(config.getString as jest.Mock).mockResolvedValue(undefined)

      const router = await setupRouter(globalContext)
      registeredPaths = router.stack.map((layer) => layer.path)
    })

    it('should register the profiles endpoints', () => {
      expect(registeredPaths).toEqual(expect.arrayContaining(['/profiles', '/profiles/metadata']))
    })
  })

  describe('when profiles are disabled', () => {
    beforeEach(async () => {
      ;(config.getString as jest.Mock).mockImplementation((key: string) =>
        Promise.resolve(key === 'DISABLE_PROFILES' ? 'true' : undefined)
      )

      const router = await setupRouter(globalContext)
      registeredPaths = router.stack.map((layer) => layer.path)
    })

    it('should not register the profiles endpoints', () => {
      expect(registeredPaths).not.toEqual(expect.arrayContaining(['/profiles', '/profiles/metadata']))
    })

    it('should keep registering the entities and queues endpoints', () => {
      expect(registeredPaths).toEqual(expect.arrayContaining(['/entities/active', '/queues/status']))
    })
  })
})
