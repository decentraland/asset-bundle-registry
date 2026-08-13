import { InvalidRequestError } from '@dcl/http-commons'
import { isDefaultProfilePointer } from '../../utils/pointers'

export const MAX_PROFILE_POINTERS_PER_REQUEST = 500
export const MAX_NAME_POINTERS_PER_REQUEST = 25

/**
 * Validates the body of the profile endpoints, which fan out into cache, database and catalyst
 * lookups, so the amount of work a single request can ask for has to be bounded. Name pointers get
 * a lower limit because they cannot be batched: each one costs its own catalyst request.
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

  const namePointers = pointers.filter(isDefaultProfilePointer)

  if (namePointers.length > MAX_NAME_POINTERS_PER_REQUEST) {
    throw new InvalidRequestError(
      `A maximum of ${MAX_NAME_POINTERS_PER_REQUEST} default profile ids can be requested at once, got ${namePointers.length}`
    )
  }

  return pointers
}
