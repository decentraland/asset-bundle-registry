import { HandlerContextWithPath } from '../../types'
import { parseProfilePointers } from '../schemas/profiles'

export async function getProfilesHandler(
  context: HandlerContextWithPath<'metrics' | 'profileRetriever' | 'profileSanitizer', '/profiles'>
) {
  const {
    components: { metrics, profileRetriever, profileSanitizer }
  } = context

  const body = await context.request.json()
  const pointers = parseProfilePointers(body)

  metrics.observe('profiles_pointers_per_request', {}, pointers.length)
  const profilesMap = await profileRetriever.getProfiles(pointers)

  return {
    body: profileSanitizer.mapEntitiesToProfiles(Array.from(profilesMap.values())),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
