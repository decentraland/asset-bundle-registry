export function generateCacheKey(platform: 'windows' | 'mac' | 'webgl', entityId: string): string {
  return `jobs:${platform}:${entityId}`
}
