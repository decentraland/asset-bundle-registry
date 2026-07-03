import { Registry } from '../types'

/**
 * Backward-compatibility shim for the decommissioned WebGL platform.
 *
 * WebGL was removed from the internal model, the processing pipeline, and from
 * the data written to the database. The public API, however, historically
 * advertised a `webgl` field inside `bundles` and `versions`. To avoid breaking
 * existing consumers, those fields are re-added here at the serialization
 * boundary:
 *
 *  - entities converted before the decommission keep their stored `webgl` value
 *    (those bundles still exist on the CDN), and
 *  - entities created afterwards report the default `pending` / empty-version
 *    value, matching what a freshly-deployed entity used to return.
 *
 * This is intentionally confined to the response boundary so the domain model
 * stays free of WebGL.
 */

const PENDING = Registry.SimplifiedStatus.PENDING
const EMPTY_VERSION = { version: '', buildDate: '' }

type StatusByPlatform = { windows: Registry.SimplifiedStatus; mac: Registry.SimplifiedStatus }
type VersionByPlatform = {
  windows: { version: string; buildDate: string }
  mac: { version: string; buildDate: string }
}

type WithWebglStatus = StatusByPlatform & { webgl: Registry.SimplifiedStatus }
type WithWebglVersion = VersionByPlatform & { webgl: { version: string; buildDate: string } }

export type LegacyBundles = { assets: WithWebglStatus; lods?: WithWebglStatus }
export type LegacyVersions = { assets: WithWebglVersion }

function withWebglStatus(map: StatusByPlatform): WithWebglStatus {
  const stored = (map as { webgl?: Registry.SimplifiedStatus }).webgl
  return { ...map, webgl: stored ?? PENDING }
}

function withWebglVersion(map: VersionByPlatform): WithWebglVersion {
  const stored = (map as { webgl?: { version: string; buildDate: string } }).webgl
  return { ...map, webgl: stored ?? { ...EMPTY_VERSION } }
}

/** Returns a copy of `bundles` with the legacy `webgl` status re-added. */
export function bundlesWithWebglCompat(bundles: Registry.Bundles): LegacyBundles {
  return {
    assets: withWebglStatus(bundles.assets),
    ...(bundles.lods ? { lods: withWebglStatus(bundles.lods) } : {})
  }
}

/**
 * Returns a copy of `versions` with the legacy `webgl` version info re-added.
 * `versions` is nullable in the database, so a missing value is passed through
 * untouched rather than being synthesized.
 */
export function versionsWithWebglCompat(
  versions: Registry.Versions | null | undefined
): LegacyVersions | null | undefined {
  // `versions` is nullable in the database; pass a missing value through untouched.
  if (!versions) {
    return versions as null | undefined
  }
  return { ...versions, assets: withWebglVersion(versions.assets) }
}

/**
 * Returns a copy of a registry entity with the legacy `webgl` fields re-added to
 * its `bundles` and `versions`. See the module-level documentation for rationale.
 */
export function withWebglCompat<T extends { bundles: Registry.Bundles; versions: Registry.Versions }>(
  entity: T
): Omit<T, 'bundles' | 'versions'> & { bundles: LegacyBundles; versions: LegacyVersions | null | undefined } {
  return {
    ...entity,
    bundles: bundlesWithWebglCompat(entity.bundles),
    versions: versionsWithWebglCompat(entity.versions)
  }
}
