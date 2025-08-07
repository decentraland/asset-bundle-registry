import { createEntityStatusFetcherComponent, ManifestStatusCode } from '../../../src/logic/entity-status-fetcher'
import { EntityStatusFetcher, Registry } from '../../../src/types'
import { createConfigMockComponent } from '../mocks/config'
import { createLogMockComponent } from '../mocks/logs'

describe('entity status fetcher', () => {
  const ASSET_BUNDLE_CDN_URL = 'https://cdn-test.tld/'
  const logs = createLogMockComponent()
  const config = createConfigMockComponent()
  config.requireString = jest.fn().mockResolvedValue(ASSET_BUNDLE_CDN_URL)
  config.getNumber = jest.fn().mockResolvedValue(2)
  const mockFetch = {
    fetch: jest.fn()
  }

  function createManifest(exitCode: ManifestStatusCode, version: string = 'v1') {
    return {
      exitCode,
      version,
      files: [],
      contentServerUrl: 'https://test.com',
      date: '2023-01-01T00:00:00.000Z'
    }
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  const ENTITY_ID = 'bafkreig4pgot2bf6iw3bfxgo4nn7ich35ztjfjhjdomz2yqmtmnagpxhjq'

  describe('bundles status and version', () => {
    it('should fetch COMPLETE bundle status and version for webgl platform', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })
      const platform = 'webgl'

      const manifest = createManifest(ManifestStatusCode.SUCCESS, 'v2')
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const result = await sut.fetchBundleStatusAndVersion(ENTITY_ID, platform)
      expect(result.status).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(result.version).toBe('v2')
      expect(mockFetch.fetch).toHaveBeenCalledWith(`${ASSET_BUNDLE_CDN_URL}manifest/${ENTITY_ID}.json`)
    })

    it('should fetch COMPLETE bundle status and version for non-webgl platform', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })
      const platform = 'android'

      const manifest = createManifest(ManifestStatusCode.SUCCESS, 'v3')
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const result = await sut.fetchBundleStatusAndVersion(ENTITY_ID, platform)
      expect(result.status).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(result.version).toBe('v3')
      expect(mockFetch.fetch).toHaveBeenCalledWith(`${ASSET_BUNDLE_CDN_URL}manifest/${ENTITY_ID}_${platform}.json`)
    })

    it('should return COMPLETE status and version for manifest with CONVERSION_ERRORS_TOLERATED', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      const manifest = createManifest(ManifestStatusCode.CONVERSION_ERRORS_TOLERATED, 'v4')
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const result = await sut.fetchBundleStatusAndVersion(ENTITY_ID, 'webgl')
      expect(result.status).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(result.version).toBe('v4')
    })

    it('should return COMPLETE status and version for manifest with ALREADY_CONVERTED', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      const manifest = createManifest(ManifestStatusCode.ALREADY_CONVERTED, 'v5')
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const result = await sut.fetchBundleStatusAndVersion(ENTITY_ID, 'webgl')
      expect(result.status).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(result.version).toBe('v5')
    })

    it('should return FAILED status and version for manifest with error status', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      const manifest = createManifest(ManifestStatusCode.ASSET_BUNDLE_BUILD_FAIL, 'v6')
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const result = await sut.fetchBundleStatusAndVersion(ENTITY_ID, 'webgl')
      expect(result.status).toBe(Registry.SimplifiedStatus.FAILED)
      expect(result.version).toBe('v6')
    })

    it('should throw error when manifest is not found (404)', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      mockFetch.fetch.mockResolvedValue({
        ok: false,
        status: 404
      })

      await expect(sut.fetchBundleStatusAndVersion(ENTITY_ID, 'webgl')).rejects.toThrow('Failed to fetch bundle status')
    })

    it('should throw error for non-404 fetch failures', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      mockFetch.fetch.mockResolvedValue({
        ok: false,
        status: 500
      })

      await expect(sut.fetchBundleStatusAndVersion(ENTITY_ID, 'webgl')).rejects.toThrow('Failed to fetch bundle status')
    })
  })

  describe('LODs status', () => {
    it('should return COMPLETE when all LODs exist', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      mockFetch.fetch.mockResolvedValue({ ok: true })

      const status = await sut.fetchLODsStatus(ENTITY_ID, 'webgl')
      expect(status).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(mockFetch.fetch).toHaveBeenCalledTimes(3)
    })

    it('should return FAILED when any LOD is missing', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      mockFetch.fetch
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({ ok: true })

      const status = await sut.fetchLODsStatus(ENTITY_ID, 'webgl')
      expect(status).toBe(Registry.SimplifiedStatus.FAILED)
    })

    it('should retry on network errors and succeed eventually', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      const manifest = createManifest(ManifestStatusCode.SUCCESS, 'v7')
      mockFetch.fetch.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const result = await sut.fetchBundleStatusAndVersion(ENTITY_ID, 'webgl')
      expect(result.status).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(result.version).toBe('v7')
      expect(mockFetch.fetch).toHaveBeenCalledTimes(2)
    })

    it('should fail after max retries', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      mockFetch.fetch.mockRejectedValue(new Error('ECONNRESET'))

      await expect(sut.fetchBundleStatusAndVersion(ENTITY_ID, 'webgl')).rejects.toThrow('ECONNRESET')
      expect(mockFetch.fetch).toHaveBeenCalledTimes(2)
    })

    it('should use platform suffix for non-webgl platforms', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })
      const platform = 'android'

      mockFetch.fetch.mockResolvedValue({ ok: true })

      await sut.fetchLODsStatus(ENTITY_ID, platform)

      // Verify that all calls include the platform suffix
      const calls = mockFetch.fetch.mock.calls
      expect(calls.length).toBe(3)
      calls.forEach((call, index) => {
        expect(call[0]).toContain(`${ENTITY_ID}_${index}_${platform}`)
      })
    })
  })
})
