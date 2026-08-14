import { InvalidRequestError } from '@dcl/http-commons'
import { isDefaultProfilePointer } from '../../utils/pointers'

export const MAX_NAME_POINTERS_PER_REQUEST = 25

/**
 * Validates the shape of the body of the profile endpoints, so a malformed one is reported as a bad
 * request instead of failing further down.
 *
 * The amount of addresses is deliberately not capped: callers batch whole pages of friends or
 * community members, and those resolve through a single upstream request however many are asked for.
 * Default profile names are capped, because each one costs its own request.
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

  const namePointers = pointers.filter(isDefaultProfilePointer)

  if (namePointers.length > MAX_NAME_POINTERS_PER_REQUEST) {
    throw new InvalidRequestError(
      `A maximum of ${MAX_NAME_POINTERS_PER_REQUEST} default profile ids can be requested at once, got ${namePointers.length}`
    )
  }

  return pointers
}
