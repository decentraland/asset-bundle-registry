import { AppComponents, EntityStatusInQueue, IQueuesStatusManagerComponent } from '../types'

export function createQueuesStatusManagerComponent({
  memoryStorage
}: Pick<AppComponents, 'memoryStorage'>): IQueuesStatusManagerComponent {
  function generateCacheKey(platform: 'windows' | 'mac' | 'webgl', entityId: string): string {
    return `jobs:${platform}:${entityId}`
  }

  function generateManualQueueKey(platform: 'windows' | 'mac' | 'webgl', entityId: string): string {
    return `manual-jobs:${platform}:${entityId}`
  }

  async function getStatus(key: string): Promise<EntityStatusInQueue | undefined> {
    const status = await memoryStorage.get<EntityStatusInQueue>(key)

    if (!status.length) return undefined

    return status[0]
  }

  async function markAsQueued(platform: 'windows' | 'mac' | 'webgl', entityId: string): Promise<void> {
    const key = generateCacheKey(platform, entityId)
    const currentValue = (await getStatus(key)) || {
      entityId,
      platform,
      status: 0
    }

    await memoryStorage.set(key, { ...currentValue, status: currentValue.status + 1 })
  }

  async function markAsFinished(platform: 'windows' | 'mac' | 'webgl', entityId: string): Promise<void> {
    const key = generateCacheKey(platform, entityId)
    const currentValue = (await getStatus(key)) || {
      entityId,
      platform,
      status: 0
    }

    const newStatus = currentValue.status - 1

    if (newStatus === 0) {
      await memoryStorage.purge(key)
      return
    }

    await memoryStorage.set<EntityStatusInQueue>(key, { ...currentValue, status: newStatus })
  }

  async function getAllPendingEntities(platform: 'windows' | 'mac' | 'webgl'): Promise<EntityStatusInQueue[]> {
    const entities = (await memoryStorage.get<EntityStatusInQueue>(`jobs:${platform}:*`)) || []
    return entities
      .filter((entity: any) => entity.status > 0)
      .map((entity) => ({
        ...entity,
        status: Math.min(entity.status, 1)
      }))
  }

  async function markAsManuallyQueued(platform: 'windows' | 'mac' | 'webgl', entityId: string): Promise<void> {
    await memoryStorage.set(generateManualQueueKey(platform, entityId), { entityId, platform })
  }

  async function isManuallyQueued(platform: 'windows' | 'mac' | 'webgl', entityId: string): Promise<boolean> {
    const entries = await memoryStorage.get<EntityStatusInQueue>(generateManualQueueKey(platform, entityId))
    return entries.length > 0
  }

  async function clearManualQueue(platform: 'windows' | 'mac' | 'webgl', entityId: string): Promise<void> {
    await memoryStorage.purge(generateManualQueueKey(platform, entityId))
  }

  return {
    markAsQueued,
    markAsFinished,
    markAsManuallyQueued,
    isManuallyQueued,
    clearManualQueue,
    getAllPendingEntities
  }
}
