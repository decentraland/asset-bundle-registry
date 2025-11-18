import { AppComponents } from '../../types'

export async function resetSyncStateHandler(context: any) {
  const {
    components: { synchronizer, logs }
  } = context as { components: AppComponents }

  const logger = logs.getLogger('reset-sync-state-handler')

  try {
    await synchronizer.resetSyncState()
    logger.info('Sync state reset successfully')

    return {
      status: 200,
      body: {
        ok: true,
        message: 'Sync state has been reset.'
      }
    }
  } catch (error: any) {
    return {
      status: 500,
      body: {
        ok: false,
        message: 'Failed to reset sync state',
        error: error.message
      }
    }
  }
}
