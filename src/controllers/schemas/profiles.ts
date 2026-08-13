import { InvalidRequestError } from '@dcl/http-commons'

export const MAX_PROFILE_POINTERS_PER_REQUEST = 500

/**
 * Validates the body of the profile endpoints, which fan out into cache, database and catalyst
 * lookups, so the amount of work a single request can ask for has to be bounded.
 */
export function parseProfilePointers(body: any): string[] {
  const pointers = body?.ids

  if (!Array.isArray(pointers) || pointers.some((pointer) => typeof pointer !== 'string' || pointer.length === 0)) {
    throw new InvalidRequestError('The ids property must be an array of non-empty strings')
  }

  if (pointers.length > MAX_PROFILE_POINTERS_PER_REQUEST) {
    throw new InvalidRequestError(
      `A maximum of ${MAX_PROFILE_POINTERS_PER_REQUEST} ids can be requested at once, got ${pointers.length}`
    )
  }

  return pointers
}
