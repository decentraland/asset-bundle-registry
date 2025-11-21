import { HandlerContextWithPath } from '../../types'

export async function getProfilesMetadataHandler(
  context: HandlerContextWithPath<'profileRetriever', '/profiles/metadata'>
) {
  const {
    components: { profileRetriever }
  } = context

  const body = await context.request.json()
  const pointers: string[] = body.ids

  const profilesMap = await profileRetriever.getProfiles(pointers)

  return {
    body: Array.from(profilesMap.values()).map((profile) => ({
      pointer: profile.pointers[0],
      hasClaimedName: profile.metadata.hasClaimedName,
      unclaimedName: profile.metadata.unclaimedName,
      name: profile.metadata.name,
      description: profile.metadata.description
    })),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
