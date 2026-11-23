/**
 * SSRF guard for deployment events the registry consumes. Mirrors the
 * asset-bundle-converter (issue #306): the deployment event's
 * `contentServerUrls[0]` is attacker-influenced and the registry fetches the
 * entity from it (catalyst / worlds), so it is pinned to a strict HTTPS +
 * exact-host allowlist. (entityId is not gated here — in the registry it only
 * reaches parameterized SQL / cache keys, not a filesystem path or S3 key.)
 *
 * The allowlist is sourced entirely from the `ALLOWED_CONTENT_SERVER_HOSTS` env var (set
 * per-environment in the `definitions` repo) — there is no built-in default.
 */

/**
 * Normalize one allowlist entry to a bare lowercase hostname. Accepts a bare
 * host or a full URL; returns undefined for blank/unparseable entries.
 */
function normalizeContentServerHost(entry: string): string | undefined {
  const trimmed = entry.trim().toLowerCase()
  if (trimmed.length === 0) return undefined
  if (trimmed.includes('/')) {
    try {
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
      const host = new URL(withScheme).hostname.replace(/^\[|\]$/g, '').toLowerCase()
      return host.length > 0 ? host : undefined
    } catch {
      return undefined
    }
  }
  return trimmed
}

/**
 * Parse the `ALLOWED_CONTENT_SERVER_HOSTS` env var (comma-separated catalyst hosts) into a
 * Set of normalized hostnames. No built-in fallback list — the caller requires
 * the var and rejects an empty result.
 */
export function parseAllowedContentServerHosts(raw: string | undefined): Set<string> {
  const hosts = (raw ?? '')
    .split(',')
    .map(normalizeContentServerHost)
    .filter((h): h is string => h !== undefined)
  return new Set(hosts)
}

/** True when `raw` is an HTTPS URL whose host is exactly on the allowlist. */
export function isAllowedContentServerUrl(raw: string, allowedHosts: Set<string>): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return allowedHosts.has(host)
}

/** Lowercase `scheme://host[:port]` of `raw`, or undefined when it is not a URL. */
export function toContentServerOrigin(raw: string): string | undefined {
  try {
    return new URL(raw).origin.toLowerCase()
  } catch {
    return undefined
  }
}

/** Outcome of resolving a message's `sourceContentServerUrl` attribute. */
export type SourceContentServerResolution =
  { ok: true; sourceContentServerUrl: string | null } | { ok: false; reason: 'not-allowlisted' }

/**
 * Resolve the server a worlds event came from. An absent attribute means the default (prd)
 * worlds server (null); a present one must be an allowlisted HTTPS URL and resolves to its origin.
 * A present but off-allowlist attribute is rejected rather than downgraded to the default, so a
 * mislabelled event can never act on the default server's rows.
 */
export function resolveSourceContentServerUrl(
  raw: string | undefined,
  allowedHosts: Set<string>
): SourceContentServerResolution {
  if (raw === undefined) {
    return { ok: true, sourceContentServerUrl: null }
  }
  const origin = toContentServerOrigin(raw)
  if (!origin || !isAllowedContentServerUrl(raw, allowedHosts)) {
    return { ok: false, reason: 'not-allowlisted' }
  }
  return { ok: true, sourceContentServerUrl: origin }
}
