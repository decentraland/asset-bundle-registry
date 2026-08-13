import { InvalidRequestError } from '@dcl/http-commons'
import { isAddressPointer, isDefaultProfilePointer } from '../../utils/pointers'

export const MAX_PROFILE_POINTERS_PER_REQUEST = 500
export const MAX_NAME_POINTERS_PER_REQUEST = 25

/**
 * Validates the body of the profile endpoints, which fan out into cache, database and catalyst
 * lookups, so the amount of work a single request can ask for has to be bounded. Name pointers get
 * a lower limit because they cannot be batched: each one costs its own catalyst request.
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

  const namePointers = pointers.filter(
    (pointer: string) => !isAddressPointer(pointer) && isDefaultProfilePointer(pointer)
  )

  if (namePointers.length > MAX_NAME_POINTERS_PER_REQUEST) {
    throw new InvalidRequestError(
      `A maximum of ${MAX_NAME_POINTERS_PER_REQUEST} default profile ids can be requested at once, got ${namePointers.length}`
    )
  }

  return pointers
}
