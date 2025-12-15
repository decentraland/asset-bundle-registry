import { Entity, Profile } from '@dcl/schemas'
import { HandlerContextWithPath, ProfileDTO } from '../../types'

export async function getProfilesHandler(
  context: HandlerContextWithPath<'profileRetriever' | 'profileSanitizer', '/profiles'>
) {
  const mapToResponse = (profiles: Entity[]): ProfileDTO[] => {
    return profileSanitizer.getProfilesWithSnapshotsAsUrls(profiles).map((profile) => ({
      timestamp: profile.timestamp,
      avatars: (profile.metadata as Profile).avatars
    }))
  }

  const {
    components: { profileRetriever, profileSanitizer }
  } = context

  const body = await context.request.json()
  const pointers: string[] = body.ids

  const profilesMap = await profileRetriever.getProfiles(pointers)

  return {
    body: profileSanitizer.mapEntitiesToProfiles(Array.from(profilesMap.values())),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
