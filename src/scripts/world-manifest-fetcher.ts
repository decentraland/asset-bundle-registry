import { AppComponents } from '../types'

export type WorldManifest = {
  empty: string[]
  occupied: string[]
  roads: string[]
}

export async function fetchWorldManifest({
  fetch,
  config
}: Pick<AppComponents, 'fetch' | 'config'>): Promise<WorldManifest> {
  const worldManifestUrl = await config.requireString('WORLD_MANIFEST_URL')
  const response = await fetch.fetch(worldManifestUrl)
  return response.json()
}
