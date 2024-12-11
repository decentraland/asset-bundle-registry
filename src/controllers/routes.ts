import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../types'
import { getStatusHandler } from './handlers/get-service-status'
import { getEntityHandler } from './handlers/get-entity'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { getEntityStatusHandler } from './handlers/get-entity-status'
import { getEntitiesStatusHandler } from './handlers/get-entities-status'

export async function setupRouter(globalContext: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()

  const signedFetchMiddleware = wellKnownComponents({
    fetcher: globalContext.components.fetch,
    optional: false,
    onError: (err: any) => ({
      error: err.message,
      message: 'This endpoint requires a signed fetch request. See ADR-44.'
    })
  })

  router.get('/status', getStatusHandler)
  router.post('/entities/active', getEntityHandler)
  router.get('/entities/status/:id', signedFetchMiddleware, getEntityStatusHandler)
  router.get('/entities/status', signedFetchMiddleware, getEntitiesStatusHandler)

  return router
}
