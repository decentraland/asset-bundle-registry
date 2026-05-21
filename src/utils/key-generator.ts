export function generateCacheKey(platform: 'windows' | 'mac', entityId: string): string {
  return `jobs:${platform}:${entityId}`
}
