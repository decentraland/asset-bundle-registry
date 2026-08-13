import { EthAddress } from '@dcl/schemas'

/**
 * Profile pointers are either an address or, for default profiles, a name. Matched on the lowercased
 * value, since every layer keys profiles by it.
 */
export function isAddressPointer(pointer: string): boolean {
  return EthAddress.validate(pointer.toLowerCase())
}
