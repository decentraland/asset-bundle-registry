import { HandlerContextWithPath } from '../../types'

export async function getProfilesMetadataHandler(
  context: HandlerContextWithPath<'profileRetriever' | 'profileSanitizer', '/profiles/metadata'>
) {
  const {
    components: { profileRetriever, profileSanitizer }
  } = context

  const body = await context.request.json()
  const pointers: string[] = body.ids

  const profilesMap = await profileRetriever.getProfiles(pointers)

  return {
    body: Array.from(profilesMap.values()).map(profileSanitizer.getMetadata),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
