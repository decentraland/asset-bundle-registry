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
