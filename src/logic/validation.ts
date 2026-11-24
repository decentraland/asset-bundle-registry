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

/**
 * `https://<host>` (lowercased) when `raw` is a bare HTTPS origin: no userinfo, port, path, query
 * or hash; a single trailing slash is accepted. Undefined otherwise.
 */
export function toBareOrigin(raw: string): string | undefined {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return undefined
  }
  if (u.protocol !== 'https:' || u.port) {
    return undefined
  }
  const origin = u.origin.toLowerCase()
  // Compare the raw text so parser normalisation (`:443`, `/.`, `?`) cannot sneak a non-bare value in.
  const lowered = raw.toLowerCase()
  return lowered === origin || lowered === `${origin}/` ? origin : undefined
}

/** Why a world event source was rejected. */
export type SourceRejectionReason = 'malformed' | 'not_bare_origin' | 'not_allowlisted'

/** Outcome of resolving a message's `sourceContentServerUrl` attribute. */
export type SourceContentServerResolution =
  | {
      ok: true
      /** Normalised attribute origin; undefined when the attribute is absent. */
      origin: string | undefined
      /** Value stored and scoped on: null = the default worlds server. */
      sourceContentServerUrl: string | null
    }
  | { ok: false; reason: SourceRejectionReason }

/**
 * Resolve the server a worlds event came from.
 * - absent (undefined): the default worlds server (null)
 * - present without a string value (null) or not a bare HTTPS origin: rejected
 * - equal to a default worlds server origin: null, checked before the allowlist
 * - host on `allowedWorldsHosts`: that origin; anything else is rejected, never downgraded to the
 *   default, so a mislabelled event can never act on the default server's rows
 */
export function resolveSourceContentServerUrl(
  raw: string | null | undefined,
  allowedWorldsHosts: Set<string>,
  defaultWorldsOrigins: Set<string>
): SourceContentServerResolution {
  if (raw === undefined) {
    return { ok: true, origin: undefined, sourceContentServerUrl: null }
  }
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'malformed' }
  }
  const origin = toBareOrigin(raw)
  if (!origin) {
    return { ok: false, reason: 'not_bare_origin' }
  }
  if (defaultWorldsOrigins.has(origin)) {
    return { ok: true, origin, sourceContentServerUrl: null }
  }
  if (!allowedWorldsHosts.has(new URL(origin).hostname)) {
    return { ok: false, reason: 'not_allowlisted' }
  }
  return { ok: true, origin, sourceContentServerUrl: origin }
}
