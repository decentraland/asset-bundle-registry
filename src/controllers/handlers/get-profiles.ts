import { HandlerContextWithPath } from '../../types'

export async function getProfilesHandler(context: HandlerContextWithPath<'profileRetriever', '/profiles'>) {
  const {
    components: { profileRetriever }
  } = context

  const body = await context.request.json()
  const pointers: string[] = body.pointers

  const profilesMap = await profileRetriever.getProfiles(pointers)

  return {
    body: Array.from(profilesMap.values()),
    headers: {
      'Content-Type': 'application/json'
    }
  }
}
