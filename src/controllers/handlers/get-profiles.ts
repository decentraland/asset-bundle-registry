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
  const parsedProfiles = profileSanitizer.getProfilesWithSnapshotsAsUrls(Array.from(profilesMap.values()))

  return {
    body: parsedProfiles,
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
