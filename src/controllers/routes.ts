import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../types'
import { getStatusHandler } from './handlers/get-service-status'
import { getEntityHandler } from './handlers/get-entity'

export async function setupRouter(_: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()

  router.get('/status', getStatusHandler)
  router.post('/entities/active', getEntityHandler)

  return router
}
