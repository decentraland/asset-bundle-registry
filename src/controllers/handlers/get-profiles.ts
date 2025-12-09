import { HandlerContextWithPath } from '../../types'

export async function getProfilesHandler(
  context: HandlerContextWithPath<'profileRetriever' | 'profileSanitizer', '/profiles'>
) {
  const {
    components: { profileRetriever, profileSanitizer }
  } = context

  const body = await context.request.json()
  const pointers: string[] = body.ids

  const profilesMap = await profileRetriever.getProfiles(pointers)
  const profilesWithUrls = profileSanitizer.getProfilesWithSnapshotsAsUrls(Array.from(profilesMap.values()))
  const response = profileSanitizer.mapToResponse(profilesWithUrls)

  return {
    body: response,
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
