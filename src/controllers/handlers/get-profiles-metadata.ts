import { HandlerContextWithPath } from '../../types'
import { parseProfilePointers } from '../schemas/profiles'

export async function getProfilesMetadataHandler(
  context: HandlerContextWithPath<'profileRetriever' | 'profileSanitizer', '/profiles/metadata'>
) {
  const {
    components: { profileRetriever, profileSanitizer }
  } = context

  const body = await context.request.json()
  const pointers = parseProfilePointers(body)

  const profilesMap = await profileRetriever.getProfiles(pointers)

  return {
    body: Array.from(profilesMap.values()).map(profileSanitizer.getMetadata),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
