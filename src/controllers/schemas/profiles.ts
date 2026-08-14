import { InvalidRequestError } from '@dcl/http-commons'

/**
 * Validates the shape of the body of the profile endpoints, so a malformed one is reported as a bad
 * request instead of failing further down. The amount of ids is deliberately not capped: callers
 * batch whole pages of friends or community members, and the lookups behind this are one upstream
 * request regardless of how many are asked for.
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

  return pointers
}
