import { AppComponents, IProfileRetrieverComponent } from '../types'
import { Entity, EntityType } from '@dcl/schemas'

export function createProfileRetrieverComponent(
  components: Pick<AppComponents, 'logs' | 'profilesCache' | 'entityPersister' | 'db' | 'catalyst'>
): IProfileRetrieverComponent {
  const { logs, profilesCache, entityPersister, db, catalyst } = components
  const logger = logs.getLogger('profile-retriever')

  async function getProfile(pointer: string): Promise<Entity | null> {
    const results = await getProfiles([pointer])
    return results.get(pointer.toLowerCase()) || null
  }

  function getFromCache(pointers: string[]): { cacheHits: Map<string, Entity>; cacheMisses: string[] } {
    const cacheHits = new Map<string, Entity>()
    const cacheMisses = []

    const retrievedProfiles = profilesCache.getMany(pointers.map((p) => p.toLowerCase()))
    for (const pointer of pointers) {
      const profile = retrievedProfiles.get(pointer.toLowerCase())
      if (profile) {
        cacheHits.set(pointer, profile)
      } else {
        cacheMisses.push(pointer)
      }
    }

    return { cacheHits, cacheMisses }
  }

  async function getFromDatabase(pointers: string[]): Promise<Entity[]> {
    try {
      const results = new Map<string, Entity>()
      const dbResults = await db.getProfilesByPointers(pointers)

      for (const dbProfile of dbResults) {
        results.set(dbProfile.pointer.toLowerCase(), {
          version: 'v3' as const,
          id: dbProfile.id,
          type: EntityType.PROFILE,
          pointers: [dbProfile.pointer],
          timestamp: dbProfile.timestamp,
          content: dbProfile.content,
          metadata: dbProfile.metadata
        })
      }

      return Array.from(results.values())
    } catch (error: any) {
      logger.warn('Failed to batch fetch from database', { error: error.message })
      return []
    }
  }

  async function getFromCatalyst(pointers: string[]): Promise<Entity[]> {
    try {
      const catalystEntities = await catalyst.getEntityByPointers(pointers)
      return catalystEntities.filter((e) => e.type === EntityType.PROFILE)
    } catch (error: any) {
      logger.warn('Failed to batch fetch from Catalyst', { error: error.message })
      return []
    }
  }

  async function getProfiles(pointers: string[]): Promise<Map<string, Entity>> {
    let retrievedProfiles = new Map<string, Entity>()

    // Layer 1: Batch fetch from hot cache (L1 cache)
    const { cacheHits, cacheMisses } = getFromCache(pointers)

    if (cacheMisses.length === 0) {
      return cacheHits
    } else {
      retrievedProfiles = cacheHits
    }

    // Layer 2: Retrieve from database
    let profilesFromDB: Entity[] = []
    profilesFromDB = await getFromDatabase(cacheMisses)

    if (profilesFromDB.length > 0) {
      profilesCache.setManyIfNewer(profilesFromDB)
      for (const profile of profilesFromDB) {
        retrievedProfiles.set(profile.pointers[0].toLowerCase(), profile)
      }
      logger.debug('Profiles found in database', { count: profilesFromDB.length })
    }

    const pointersFoundInDB = new Set(profilesFromDB.map((p) => p.pointers[0].toLowerCase()))
    const pointersMissingFromDB = cacheMisses.filter((p) => !pointersFoundInDB.has(p))
    if (pointersMissingFromDB.length === 0) {
      logger.debug('All remaining profiles found in database', { total: retrievedProfiles.size })
      return retrievedProfiles
    }

    // Layer 3: Fall-back to Catalyst
    logger.debug('Fetching remaining profiles from Catalyst', { count: pointersMissingFromDB.length })
    const profilesFromCatalyst = await getFromCatalyst(pointersMissingFromDB)
    if (profilesFromCatalyst.length > 0) {
      await Promise.all(profilesFromCatalyst.map((p) => entityPersister.persistEntity(p)))
      for (const profile of profilesFromCatalyst) retrievedProfiles.set(profile.pointers[0].toLowerCase(), profile)
      logger.debug('Profiles found in Catalyst', { count: profilesFromCatalyst.length })
    }

    logger.info('Profile retrieval complete', {
      requested: pointers.length,
      found: retrievedProfiles.size,
      notFound: pointers.length - retrievedProfiles.size
    })

    return retrievedProfiles
  }

  return {
    getProfile,
    getProfiles
  }
}
