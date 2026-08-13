import { InvalidRequestError } from '@dcl/http-commons'

export const MAX_PROFILE_POINTERS_PER_REQUEST = 500

/**
 * Validates the body of the profile endpoints, which fan out into cache, database and catalyst
 * lookups, so the amount of work a single request can ask for has to be bounded.
 */
function getIds(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('ids' in body)) {
    return undefined
  }

  return body.ids
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((pointer) => typeof pointer === 'string' && pointer.length > 0)
}

export function parseProfilePointers(body: unknown): string[] {
  const pointers = getIds(body)

  if (!isNonEmptyStringArray(pointers)) {
    throw new InvalidRequestError('The ids property must be an array of non-empty strings')
  }

  if (pointers.length > MAX_PROFILE_POINTERS_PER_REQUEST) {
    throw new InvalidRequestError(
      `A maximum of ${MAX_PROFILE_POINTERS_PER_REQUEST} ids can be requested at once, got ${pointers.length}`
    )
  }

  return pointers
}
