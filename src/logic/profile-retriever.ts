import { AppComponents, IProfileRetrieverComponent } from '../types'
import { Entity, EntityType } from '@dcl/schemas'
import { REDIS_PROFILE_PREFIX, FOUR_HOURS_IN_SECONDS } from '../types/constants'

export function createProfileRetriever(
  components: Pick<AppComponents, 'logs' | 'hotProfilesCache' | 'memoryStorage' | 'db' | 'catalyst'>
): IProfileRetrieverComponent {
  const { logs, hotProfilesCache, memoryStorage, db, catalyst } = components
  const logger = logs.getLogger('profile-retriever')

  async function updateCaches(profiles: Entity[]): Promise<void> {
    if (profiles.length === 0) return
    hotProfilesCache.setManyIfNewer(profiles)
    const redisEntries = profiles.map((profile) => ({
      key: `${REDIS_PROFILE_PREFIX}${profile.pointers[0].toLowerCase()}`,
      value: JSON.stringify(profile)
    }))
    await memoryStorage.setMany(redisEntries, FOUR_HOURS_IN_SECONDS)
  }

  async function getProfile(pointer: string): Promise<Entity | null> {
    const results = await getProfiles([pointer])
    return results.get(pointer.toLowerCase()) || null
  }

  async function getProfiles(pointers: string[]): Promise<Map<string, Entity>> {
    const results = new Map<string, Entity>()
    const normalizedPointers = pointers.map((p) => p.toLowerCase())

    // Layer 1: Batch fetch from hot cache (L1 cache)
    const hotCacheResults = hotProfilesCache.getMany(normalizedPointers)
    const notInHotCache: string[] = []

    for (const pointer of normalizedPointers) {
      const profile = hotCacheResults.get(pointer)
      if (profile) {
        results.set(pointer, profile)
      } else {
        notInHotCache.push(pointer)
      }
    }

    if (notInHotCache.length === 0) {
      return results
    }

    // Layer 2: Batch fetch from Redis (L2 cache)
    const redisKeys = notInHotCache.map((p) => `${REDIS_PROFILE_PREFIX}${p}`)
    const redisResults = new Map<string, Entity>()

    try {
      const redisMap = await memoryStorage.getMany<string>(redisKeys)

      for (const pointer of notInHotCache) {
        const key = `${REDIS_PROFILE_PREFIX}${pointer}`
        const profileJson = redisMap.get(key)
        if (profileJson) {
          try {
            const profile = JSON.parse(profileJson) as Entity
            redisResults.set(pointer, profile)
            results.set(pointer, profile)
          } catch {
            logger.warn('Failed to parse profile from L2 cache', { pointer })
          }
        }
      }

      if (redisResults.size > 0) {
        hotProfilesCache.setManyIfNewer(Array.from(redisResults.values()))
        logger.debug('Profiles found in L2 cache, updating L1 cache', { count: redisResults.size })
      }
    } catch (error: any) {
      logger.warn('Failed to batch fetch from L2 cache', { error: error.message })
    }

    const notInRedis = notInHotCache.filter((p) => !redisResults.has(p))
    if (notInRedis.length === 0) {
      logger.debug('All remaining profiles found in L2 cache', { total: results.size })
      return results
    }

    // Layer 3: Batch fetch from database
    let dbProfiles: Entity[] = []
    try {
      const dbResults = await db.getProfilesByPointers(notInRedis)
      dbProfiles = dbResults.map((dbProfile) => ({
        version: 'v3' as const,
        id: dbProfile.id,
        type: EntityType.PROFILE,
        pointers: [dbProfile.pointer],
        timestamp: dbProfile.timestamp,
        content: dbProfile.content,
        metadata: dbProfile.metadata
      }))

      if (dbProfiles.length > 0) {
        await updateCaches(dbProfiles)
        for (const profile of dbProfiles) {
          results.set(profile.pointers[0].toLowerCase(), profile)
        }
        logger.debug('Profiles found in database', { count: dbProfiles.length })
      }
    } catch (error: any) {
      logger.warn('Failed to batch fetch from database', { error: error.message })
    }

    const foundInDb = new Set(dbProfiles.map((p) => p.pointers[0].toLowerCase()))
    const notInDb = notInRedis.filter((p) => !foundInDb.has(p))
    if (notInDb.length === 0) {
      logger.debug('All remaining profiles found in database', { total: results.size })
      return results
    }

    // Layer 4: Batch fetch from Catalyst
    try {
      logger.debug('Fetching remaining profiles from Catalyst', { count: notInDb.length })
      const catalystEntities = await catalyst.getEntityByPointers(notInDb)
      const profileEntities = catalystEntities.filter((e) => e.type === 'profile')

      if (profileEntities.length > 0) {
        await updateCaches(profileEntities)
        for (const profile of profileEntities) {
          results.set(profile.pointers[0].toLowerCase(), profile)
        }
        logger.debug('Profiles found in Catalyst', { count: profileEntities.length })
      }
    } catch (error: any) {
      logger.warn('Failed to batch fetch from Catalyst', { error: error.message })
    }

    logger.info('Profile retrieval complete', {
      requested: pointers.length,
      found: results.size,
      notFound: pointers.length - results.size
    })

    return results
  }

  return {
    getProfile,
    getProfiles
  }
}
