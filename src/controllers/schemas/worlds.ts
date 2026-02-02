export function isWorldNameValid(worldName: string): boolean {
  return /^[a-zA-Z0-9-]+(\.dcl)?\.eth$/.test(worldName)
}
