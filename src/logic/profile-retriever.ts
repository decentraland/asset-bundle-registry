import { AppComponents, IProfileRetrieverComponent } from '../types'
import { Entity, EntityType } from '@dcl/schemas'

const REDIS_PROFILE_PREFIX = 'profile:'
// Note: TTL is managed by Redis/memory storage configuration, not per-key
// const REDIS_PROFILE_TTL_SECONDS = 3600 // 1 hour TTL for Redis cache

export function createProfileRetriever(
  components: Pick<AppComponents, 'logs' | 'hotProfilesCache' | 'memoryStorage' | 'db' | 'catalyst'>
): IProfileRetrieverComponent {
  const { logs, hotProfilesCache, memoryStorage, db, catalyst } = components
  const logger = logs.getLogger('profile-retriever')

  async function getProfileFromRedis(pointer: string): Promise<Entity | null> {
    try {
      const key = `${REDIS_PROFILE_PREFIX}${pointer.toLowerCase()}`
      const cached = await memoryStorage.get<string>(key)
      if (cached && cached.length > 0) {
        const profile = JSON.parse(cached[0]) as Entity
        logger.debug('Profile found in Redis', { pointer })
        return profile
      }
    } catch (error: any) {
      logger.warn('Failed to fetch profile from Redis', { pointer, error: error.message })
    }
    return null
  }

  async function cacheProfileInRedis(profile: Entity): Promise<void> {
    try {
      const key = `${REDIS_PROFILE_PREFIX}${profile.pointers[0].toLowerCase()}`
      const profileJson = JSON.stringify(profile)
      await memoryStorage.purge(key)
      await memoryStorage.set<string>(key, profileJson)
      logger.debug('Profile cached in Redis', { pointer: profile.pointers[0] })
    } catch (error: any) {
      logger.warn('Failed to cache profile in Redis', { pointer: profile.pointers[0], error: error.message })
    }
  }

  async function getProfileFromDatabase(pointer: string): Promise<Entity | null> {
    try {
      const dbProfile = await db.getProfileByPointer(pointer)
      if (dbProfile) {
        logger.debug('Profile found in database', { pointer })
        // Convert DbEntity to Entity
        const profile: Entity = {
          version: 'v3',
          id: dbProfile.id,
          type: EntityType.PROFILE,
          pointers: [dbProfile.pointer],
          timestamp: dbProfile.timestamp,
          content: dbProfile.content,
          metadata: dbProfile.metadata
        }
        return profile
      }
    } catch (error: any) {
      logger.warn('Failed to fetch profile from database', { pointer, error: error.message })
    }
    return null
  }

  async function getProfileFromCatalyst(pointer: string): Promise<Entity | null> {
    try {
      logger.debug('Fetching profile from Catalyst', { pointer })
      const entities = await catalyst.getEntityByPointers([pointer])
      if (entities && entities.length > 0) {
        const entity = entities[0]
        if (entity.type === 'profile') {
          logger.debug('Profile found in Catalyst', { pointer })
          return entity
        }
      }
    } catch (error: any) {
      logger.warn('Failed to fetch profile from Catalyst', { pointer, error: error.message })
    }
    return null
  }

  async function getProfile(pointer: string): Promise<Entity | null> {
    const normalizedPointer = pointer.toLowerCase()

    // Layer 1: Hot in-memory cache
    const cachedProfile = hotProfilesCache.get(normalizedPointer)
    if (cachedProfile) {
      logger.debug('Profile retrieved from hot cache', { pointer: normalizedPointer })
      return cachedProfile
    }

    // Layer 2: Redis cache
    const redisProfile = await getProfileFromRedis(normalizedPointer)
    if (redisProfile) {
      // Update hot cache
      hotProfilesCache.setIfNewer(normalizedPointer, redisProfile)
      return redisProfile
    }

    // Layer 3: Database
    const dbProfile = await getProfileFromDatabase(normalizedPointer)
    if (dbProfile) {
      // Update caches
      hotProfilesCache.setIfNewer(normalizedPointer, dbProfile)
      await cacheProfileInRedis(dbProfile)
      return dbProfile
    }

    // Layer 4: Catalyst fallback
    const catalystProfile = await getProfileFromCatalyst(normalizedPointer)
    if (catalystProfile) {
      // Update caches
      hotProfilesCache.setIfNewer(normalizedPointer, catalystProfile)
      await cacheProfileInRedis(catalystProfile)
      return catalystProfile
    }

    logger.debug('Profile not found in any layer', { pointer: normalizedPointer })
    return null
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
      logger.debug('All profiles found in hot cache', { count: results.size })
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
        version: 'v3' as const, // outdated property
        id: dbProfile.id,
        type: EntityType.PROFILE,
        pointers: [dbProfile.pointer],
        timestamp: dbProfile.timestamp,
        content: dbProfile.content,
        metadata: dbProfile.metadata
      }))

      // Add to results
      for (const profile of dbProfiles) {
        const pointer = profile.pointers[0].toLowerCase()
        results.set(pointer, profile)
      }

      // Update caches (L1 and L2)
      if (dbProfiles.length > 0) {
        hotProfilesCache.setManyIfNewer(dbProfiles)

        // Batch cache in Redis
        const redisEntries = dbProfiles.map((profile) => ({
          key: `${REDIS_PROFILE_PREFIX}${profile.pointers[0].toLowerCase()}`,
          value: JSON.stringify(profile)
        }))
        await memoryStorage.setMany(redisEntries)
        logger.debug('Profiles found in database correctly added to L1 and L2 caches', { count: dbProfiles.length })
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

      // Add to results
      for (const profile of profileEntities) {
        const pointer = profile.pointers[0].toLowerCase()
        results.set(pointer, profile)
      }

      // Update caches
      if (profileEntities.length > 0) {
        hotProfilesCache.setManyIfNewer(profileEntities)

        // Batch cache in Redis
        const redisEntries = profileEntities.map((profile) => ({
          key: `${REDIS_PROFILE_PREFIX}${profile.pointers[0].toLowerCase()}`,
          value: JSON.stringify(profile)
        }))
        await memoryStorage.setMany(redisEntries)
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
