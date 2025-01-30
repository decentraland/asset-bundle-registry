import { AppComponents, EntityStatusInQueue, QueuesStatusManagerComponent } from '../types'

export function createQueuesStatusManagerComponent({
  memoryStorage
}: Pick<AppComponents, 'memoryStorage'>): QueuesStatusManagerComponent {
  function generateCacheKey(platform: 'windows' | 'mac' | 'webgl', entityId: string): string {
    return `jobs:${platform}:${entityId}`
  }

  async function getStatus(key: string): Promise<EntityStatusInQueue | undefined> {
    const status = await memoryStorage.get(key)

    if (!status) return undefined

    return status
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

    await memoryStorage.set(key, { ...currentValue, status: newStatus })
  }

  async function getAllPendingEntities(): Promise<EntityStatusInQueue[]> {
    const entities = await memoryStorage.get('jobs:*')

    return entities.filter((entity: any) => entity.status > 0)
  }

  return {
    markAsQueued,
    markAsFinished,
    getAllPendingEntities
  }
}
