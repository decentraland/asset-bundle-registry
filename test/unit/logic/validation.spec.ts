import { isAllowedContentServerUrl, parseAllowedContentServerHosts } from '../../../src/logic/validation'

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
