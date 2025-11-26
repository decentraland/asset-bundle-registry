import { Entity, Profile } from '@dcl/schemas'
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
    body: Array.from(profilesMap.values()).map((profile: Entity) => {
      const avatar = (profile.metadata as Profile).avatars[0]
      return {
        pointer: profile.pointers[0],
        hasClaimedName: avatar.hasClaimedName,
        name: avatar.name
      }
    })
  }
}
