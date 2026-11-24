import {
  isAllowedContentServerUrl,
  parseAllowedContentServerHosts,
  resolveSourceContentServerUrl,
  SourceContentServerResolution
} from '../../../src/logic/validation'

describe('when parsing the ALLOWED_CONTENT_SERVER_HOSTS value', () => {
  let result: Set<string>

  describe('and the value is undefined', () => {
    beforeEach(() => {
      result = parseAllowedContentServerHosts(undefined)
    })

    it('should produce an empty set, since there is no built-in default', () => {
      expect(result.size).toBe(0)
    })
  })

  describe('and the entries are uppercased or full URLs', () => {
    beforeEach(() => {
      result = parseAllowedContentServerHosts('PEER.example.org, https://peer-2.example.org/content')
    })

    it('should lowercase and normalize each entry down to its hostname', () => {
      expect(result).toEqual(new Set(['peer.example.org', 'peer-2.example.org']))
    })
  })

  describe('and the value contains only separators and whitespace', () => {
    beforeEach(() => {
      result = parseAllowedContentServerHosts(' , ,')
    })

    it('should produce an empty set', () => {
      expect(result.size).toBe(0)
    })
  })
})

describe('when validating a content-server URL against the allowlist', () => {
  let allowedHosts: Set<string>
  let result: boolean

  beforeEach(() => {
    allowedHosts = parseAllowedContentServerHosts('peer.decentraland.org, worlds-content-server.decentraland.org')
  })

  describe('and the URL is an HTTPS host on the allowlist', () => {
    beforeEach(() => {
      result = isAllowedContentServerUrl('https://peer.decentraland.org/content', allowedHosts)
    })

    it('should accept it', () => {
      expect(result).toBe(true)
    })
  })

  describe('and the host is not on the allowlist', () => {
    beforeEach(() => {
      result = isAllowedContentServerUrl('https://evil.example.com/content', allowedHosts)
    })

    it('should reject it', () => {
      expect(result).toBe(false)
    })
  })

  describe('and the URL points at the cloud metadata IP', () => {
    beforeEach(() => {
      result = isAllowedContentServerUrl('https://169.254.169.254/latest/meta-data/', allowedHosts)
    })

    it('should reject it, since no IP literal is on the allowlist', () => {
      expect(result).toBe(false)
    })
  })

  describe('and an allowlisted host is requested over plain HTTP', () => {
    beforeEach(() => {
      result = isAllowedContentServerUrl('http://peer.decentraland.org/content', allowedHosts)
    })

    it('should reject it, since content servers must be HTTPS', () => {
      expect(result).toBe(false)
    })
  })

  describe('and the allowlist is empty', () => {
    beforeEach(() => {
      allowedHosts = new Set()
      result = isAllowedContentServerUrl('https://peer.decentraland.org/content', allowedHosts)
    })

    it('should reject every URL', () => {
      expect(result).toBe(false)
    })
  })
})

describe('when resolving a world event sourceContentServerUrl attribute', () => {
  let allowedWorldsHosts: Set<string>
  let defaultWorldsOrigins: Set<string>
  let result: SourceContentServerResolution

  beforeEach(() => {
    allowedWorldsHosts = new Set(['worlds-content-server.dcl.dev'])
    defaultWorldsOrigins = new Set(['https://worlds-content-server.decentraland.org'])
  })

  describe('and the attribute is absent', () => {
    beforeEach(() => {
      result = resolveSourceContentServerUrl(undefined, allowedWorldsHosts, defaultWorldsOrigins)
    })

    it('should resolve to the default worlds server', () => {
      expect(result).toEqual({ ok: true, origin: undefined, sourceContentServerUrl: null })
    })
  })

  describe('and the attribute key had no string value', () => {
    beforeEach(() => {
      result = resolveSourceContentServerUrl(null, allowedWorldsHosts, defaultWorldsOrigins)
    })

    it('should reject it as malformed', () => {
      expect(result).toEqual({ ok: false, reason: 'malformed' })
    })
  })

  describe('and the attribute is an allowlisted origin with uppercase letters and a trailing slash', () => {
    beforeEach(() => {
      result = resolveSourceContentServerUrl(
        'HTTPS://Worlds-Content-Server.DCL.dev/',
        allowedWorldsHosts,
        defaultWorldsOrigins
      )
    })

    it('should resolve to the lowercased bare origin', () => {
      expect(result).toEqual({
        ok: true,
        origin: 'https://worlds-content-server.dcl.dev',
        sourceContentServerUrl: 'https://worlds-content-server.dcl.dev'
      })
    })
  })

  describe('and the attribute carries a path', () => {
    beforeEach(() => {
      result = resolveSourceContentServerUrl(
        'https://worlds-content-server.dcl.dev/worlds-content-server',
        allowedWorldsHosts,
        defaultWorldsOrigins
      )
    })

    it('should reject it as not a bare origin', () => {
      expect(result).toEqual({ ok: false, reason: 'not_bare_origin' })
    })
  })

  describe.each([
    ['an explicit port', 'https://worlds-content-server.dcl.dev:8443'],
    ['userinfo', 'https://user@worlds-content-server.dcl.dev'],
    ['a query', 'https://worlds-content-server.dcl.dev/?a=1'],
    ['an empty query', 'https://worlds-content-server.dcl.dev/?'],
    ['a hash', 'https://worlds-content-server.dcl.dev/#x'],
    ['the http scheme', 'http://worlds-content-server.dcl.dev'],
    ['the default https port', 'https://worlds-content-server.dcl.dev:443'],
    ['a dot path', 'https://worlds-content-server.dcl.dev/.']
  ])('and the attribute has %s', (_label: string, raw: string) => {
    beforeEach(() => {
      result = resolveSourceContentServerUrl(raw, allowedWorldsHosts, defaultWorldsOrigins)
    })

    it('should reject it as not a bare origin', () => {
      expect(result).toEqual({ ok: false, reason: 'not_bare_origin' })
    })
  })

  describe('and the attribute is the default worlds server origin', () => {
    beforeEach(() => {
      result = resolveSourceContentServerUrl(
        'https://worlds-content-server.decentraland.org',
        new Set<string>(),
        defaultWorldsOrigins
      )
    })

    it('should resolve to the default worlds server even when it is not allowlisted', () => {
      expect(result).toEqual({
        ok: true,
        origin: 'https://worlds-content-server.decentraland.org',
        sourceContentServerUrl: null
      })
    })
  })

  describe('and the attribute host is not on the worlds allowlist', () => {
    beforeEach(() => {
      result = resolveSourceContentServerUrl('https://peer.decentraland.org', allowedWorldsHosts, defaultWorldsOrigins)
    })

    it('should reject it as not allowlisted', () => {
      expect(result).toEqual({ ok: false, reason: 'not_allowlisted' })
    })
  })
})
