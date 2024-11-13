import { test } from '../components'

test('GET /status', function ({ components }) {
  const endpointPath = '/status'

  it('should return the service status', async function () {
    const response = await components.localFetch.fetch(endpointPath, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      data: {
        version: expect.any(String),
        currentTime: expect.any(Number),
        commitHash: expect.any(String)
      }
    })
  })
})
