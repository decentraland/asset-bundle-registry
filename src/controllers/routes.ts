import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../types'
import { getStatusHandler } from './handlers/get-service-status'
import { getActiveEntityHandler } from './handlers/get-active-entities'
import { wellKnownComponents } from '@dcl/platform-crypto-middleware'
import { getEntityStatusHandler, getEntitiesStatusHandler, getBundleStatusHandler } from './handlers/get-entity-status'
import { bearerTokenMiddleware, errorHandler } from '@dcl/platform-server-commons'
import { createRegistryHandler } from './handlers/post-registry'

export async function setupRouter(globalContext: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()
  router.use(errorHandler)

  const signedFetchMiddleware = wellKnownComponents({
    fetcher: globalContext.components.fetch,
    optional: false,
    onError: (err: any) => ({
      error: err.message,
      message: 'This endpoint requires a signed fetch request. See ADR-44.'
    })
  })

  router.get('/status', getStatusHandler)
  router.post('/entities/active', getActiveEntityHandler)
  router.get('/entities/status/:id', signedFetchMiddleware, getEntityStatusHandler)
  router.get('/entities/status', signedFetchMiddleware, getEntitiesStatusHandler)
  router.get('/bundles/status/:id', getBundleStatusHandler)

  const adminToken = await globalContext.components.config.getString('API_ADMIN_TOKEN')

  if (!!adminToken) {
    router.post('/registry', bearerTokenMiddleware(adminToken), createRegistryHandler)
  }

  return router
}
