import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'

function getWearablesMissmatch(originalProfile: Profile, fetchedProfile: Profile): string[] {
  const originalWearables = (originalProfile.avatars?.[0]?.avatar?.wearables || []).map((wearable) =>
    wearable.toLowerCase()
  )
  const fetchedWearables = (fetchedProfile.avatars?.[0]?.avatar?.wearables || []).map((wearable) =>
    wearable.toLowerCase()
  )
  return originalWearables.filter((wearable) => !fetchedWearables.includes(wearable))
}

function getEmotesMissmatch(originalProfile: Profile, fetchedProfile: Profile): string[] {
  const originalEmotes = (originalProfile.avatars?.[0]?.avatar?.emotes || []).map(({ urn, slot }) =>
    `${urn}-${slot}`.toLowerCase()
  )
  const fetchedEmotes = (fetchedProfile.avatars?.[0]?.avatar?.emotes || []).map(({ urn, slot }) =>
    `${urn}-${slot}`.toLowerCase()
  )
  return originalEmotes.filter((emote) => !fetchedEmotes.includes(emote))
}

function isNameEqual(originalProfile: Profile, fetchedProfile: Profile): boolean {
  return originalProfile.avatars?.[0]?.name === fetchedProfile.avatars?.[0]?.name
}

function isHasClaimedNameEqual(originalProfile: Profile, fetchedProfile: Profile): boolean {
  return originalProfile.avatars?.[0]?.hasClaimedName === fetchedProfile.avatars?.[0]?.hasClaimedName
}

export function getProfilesMissmatch(
  originalProfile: Profile,
  fetchedProfile: Profile
): {
  wearablesMissmatch: string[]
  emotesMissmatch: string[]
  nameMissmatch: boolean
  hasClaimedNameMissmatch: boolean
} {
  return {
    wearablesMissmatch: getWearablesMissmatch(originalProfile, fetchedProfile),
    emotesMissmatch: getEmotesMissmatch(originalProfile, fetchedProfile),
    nameMissmatch: !isNameEqual(originalProfile, fetchedProfile),
    hasClaimedNameMissmatch: !isHasClaimedNameEqual(originalProfile, fetchedProfile)
  }
}
