import { AppComponents } from '../types'
import { Profile } from '../types/profiles'

export type ProfileRetrieverComponent = {
  getProfile(pointer: string): Promise<Profile.Entity | null>
  getProfiles(pointers: string[]): Promise<Map<string, Profile.Entity>>
}

const REDIS_PROFILE_PREFIX = 'profile:'
// Note: TTL is managed by Redis/memory storage configuration, not per-key
// const REDIS_PROFILE_TTL_SECONDS = 3600 // 1 hour TTL for Redis cache

export function createProfileRetriever(
  components: Pick<AppComponents, 'logs' | 'hotProfilesCache' | 'memoryStorage' | 'profilesDb' | 'catalyst'>
): ProfileRetrieverComponent {
  const { logs, hotProfilesCache, memoryStorage, profilesDb, catalyst } = components
  const logger = logs.getLogger('profile-retriever')

  async function getProfileFromRedis(pointer: string): Promise<Profile.Entity | null> {
    try {
      const key = `${REDIS_PROFILE_PREFIX}${pointer.toLowerCase()}`
      const cached = await memoryStorage.get<string>(key)
      if (cached && cached.length > 0) {
        const profile = JSON.parse(cached[0]) as Profile.Entity
        logger.debug('Profile found in Redis', { pointer })
        return profile
      }
    } catch (error: any) {
      logger.warn('Failed to fetch profile from Redis', { pointer, error: error.message })
    }
    return null
  }

  async function cacheProfileInRedis(profile: Profile.Entity): Promise<void> {
    try {
      const key = `${REDIS_PROFILE_PREFIX}${profile.pointer.toLowerCase()}`
      const profileJson = JSON.stringify(profile)
      await memoryStorage.purge(key)
      await memoryStorage.set<string>(key, profileJson)
      logger.debug('Profile cached in Redis', { pointer: profile.pointer })
    } catch (error: any) {
      logger.warn('Failed to cache profile in Redis', { pointer: profile.pointer, error: error.message })
    }
  }

  async function getProfileFromDatabase(pointer: string): Promise<Profile.Entity | null> {
    try {
      const dbProfile = await profilesDb.getProfileByPointer(pointer)
      if (dbProfile) {
        logger.debug('Profile found in database', { pointer })
        // Convert DbEntity to Entity (strip localTimestamp)
        const profile: Profile.Entity = {
          id: dbProfile.id,
          pointer: dbProfile.pointer,
          timestamp: dbProfile.timestamp,
          content: dbProfile.content,
          metadata: dbProfile.metadata,
          authChain: dbProfile.authChain
        }
        return profile
      }
    } catch (error: any) {
      logger.warn('Failed to fetch profile from database', { pointer, error: error.message })
    }
    return null
  }

  async function getProfileFromCatalyst(pointer: string): Promise<Profile.Entity | null> {
    try {
      logger.debug('Fetching profile from Catalyst', { pointer })
      const entities = await catalyst.getEntityByPointers([pointer])
      if (entities && entities.length > 0) {
        const entity = entities[0]
        if (entity.type === 'profile') {
          logger.debug('Profile found in Catalyst', { pointer })
          const profile: Profile.Entity = {
            id: entity.id,
            pointer: entity.pointers[0],
            timestamp: entity.timestamp,
            content: entity.content,
            metadata: entity.metadata || {},
            authChain: [] // Catalyst doesn't return authChain via this endpoint
          }
          return profile
        }
      }
    } catch (error: any) {
      logger.warn('Failed to fetch profile from Catalyst', { pointer, error: error.message })
    }
    return null
  }

  async function getProfile(pointer: string): Promise<Profile.Entity | null> {
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

  async function getProfiles(pointers: string[]): Promise<Map<string, Profile.Entity>> {
    const results = new Map<string, Profile.Entity>()
    const notFoundPointers: string[] = []

    // First pass: check hot cache for all pointers
    for (const pointer of pointers) {
      const normalizedPointer = pointer.toLowerCase()
      const cachedProfile = hotProfilesCache.get(normalizedPointer)
      if (cachedProfile) {
        results.set(normalizedPointer, cachedProfile)
      } else {
        notFoundPointers.push(normalizedPointer)
      }
    }

    if (notFoundPointers.length === 0) {
      logger.debug('All profiles found in hot cache', { count: results.size })
      return results
    }

    // Second pass: check Redis for remaining pointers
    const stillNotFound: string[] = []
    for (const pointer of notFoundPointers) {
      const redisProfile = await getProfileFromRedis(pointer)
      if (redisProfile) {
        results.set(pointer, redisProfile)
        hotProfilesCache.setIfNewer(pointer, redisProfile)
      } else {
        stillNotFound.push(pointer)
      }
    }

    if (stillNotFound.length === 0) {
      logger.debug('All remaining profiles found in Redis', { cached: results.size })
      return results
    }

    // Third pass: check database for remaining pointers
    const finalNotFound: string[] = []
    for (const pointer of stillNotFound) {
      const dbProfile = await getProfileFromDatabase(pointer)
      if (dbProfile) {
        results.set(pointer, dbProfile)
        hotProfilesCache.setIfNewer(pointer, dbProfile)
        await cacheProfileInRedis(dbProfile)
      } else {
        finalNotFound.push(pointer)
      }
    }

    if (finalNotFound.length === 0) {
      logger.debug('All remaining profiles found in database', { total: results.size })
      return results
    }

    // Fourth pass: fetch from Catalyst for remaining pointers
    logger.debug('Fetching remaining profiles from Catalyst', { count: finalNotFound.length })
    for (const pointer of finalNotFound) {
      const catalystProfile = await getProfileFromCatalyst(pointer)
      if (catalystProfile) {
        results.set(pointer, catalystProfile)
        hotProfilesCache.setIfNewer(pointer, catalystProfile)
        await cacheProfileInRedis(catalystProfile)
      }
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
