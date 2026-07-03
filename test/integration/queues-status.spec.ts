import { createRequestMaker } from '../utils'
import { test } from '../components'

test('GET /queues/status', function ({ components }) {
  let fetchLocally: any

  beforeAll(async function () {
    const { makeLocalRequest } = createRequestMaker(components)
    fetchLocally = makeLocalRequest
  })

  describe('when there are pending windows and mac jobs', () => {
    const windowsEntityId = 'baf-queues-windows-1'
    const macEntityId = 'baf-queues-mac-1'

    beforeEach(async () => {
      await components.queuesStatusManager.markAsQueued('windows', windowsEntityId)
      await components.queuesStatusManager.markAsQueued('mac', macEntityId)
    })

    afterEach(async () => {
      await components.queuesStatusManager.markAsFinished('windows', windowsEntityId)
      await components.queuesStatusManager.markAsFinished('mac', macEntityId)
    })

    it('should list the pending windows job entity id', async () => {
      const response = await fetchLocally('GET', '/queues/status', undefined, undefined)
      const body = await response.json()

      expect(body.windowsPendingJobs).toContain(windowsEntityId)
    })

    it('should list the pending mac job entity id', async () => {
      const response = await fetchLocally('GET', '/queues/status', undefined, undefined)
      const body = await response.json()

      expect(body.macPendingJobs).toContain(macEntityId)
    })

    it('should return an empty webglPendingJobs array for backward compatibility', async () => {
      const response = await fetchLocally('GET', '/queues/status', undefined, undefined)
      const body = await response.json()

      expect(body.webglPendingJobs).toEqual([])
    })
  })

  describe('when there are no pending jobs', () => {
    it('should still return the webglPendingJobs field as an empty array', async () => {
      const response = await fetchLocally('GET', '/queues/status', undefined, undefined)
      const body = await response.json()

      expect(body.webglPendingJobs).toEqual([])
    })
  })
})
