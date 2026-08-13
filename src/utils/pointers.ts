import { EthAddress } from '@dcl/schemas'

const DEFAULT_PROFILE_POINTER_PREFIX = 'default'

/**
 * Profile pointers are either an address or, for default profiles, a name. Both are matched on the
 * lowercased value, since every layer keys profiles by it.
 */
export function isAddressPointer(pointer: string): boolean {
  return EthAddress.validate(pointer.toLowerCase())
}

export function isDefaultProfilePointer(pointer: string): boolean {
  return pointer.toLowerCase().startsWith(DEFAULT_PROFILE_POINTER_PREFIX)
}
