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

  function createManifest(exitCode: ManifestStatusCode) {
    return {
      exitCode
    }
  }

  afterEach(() => {
    jest.clearAllMocks()
  })

  const ENTITY_ID = 'bafkreig4pgot2bf6iw3bfxgo4nn7ich35ztjfjhjdomz2yqmtmnagpxhjq'

  describe('bundles status', () => {
    it('should fetch COMPLETE bundle status for webgl platform', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })
      const platform = 'webgl'

      const manifest = createManifest(ManifestStatusCode.SUCCESS)
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const status = await sut.fetchBundleStatus(ENTITY_ID, platform)
      expect(status).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(mockFetch.fetch).toHaveBeenCalledWith(`${ASSET_BUNDLE_CDN_URL}manifest/${ENTITY_ID}.json`)
    })

    it('should fetch COMPLETE bundle status for non-webgl platform', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })
      const platform = 'android'

      const manifest = createManifest(ManifestStatusCode.SUCCESS)
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const status = await sut.fetchBundleStatus(ENTITY_ID, platform)
      expect(status).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(mockFetch.fetch).toHaveBeenCalledWith(`${ASSET_BUNDLE_CDN_URL}manifest/${ENTITY_ID}_${platform}.json`)
    })

    it('should return COMPLETE for manifest with CONVERSION_ERRORS_TOLERATED', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      const manifest = createManifest(ManifestStatusCode.CONVERSION_ERRORS_TOLERATED)
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const status = await sut.fetchBundleStatus(ENTITY_ID, 'webgl')
      expect(status).toBe(Registry.SimplifiedStatus.COMPLETE)
    })

    it('should return COMPLETE for manifest with ALREADY_CONVERTED', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      const manifest = createManifest(ManifestStatusCode.ALREADY_CONVERTED)
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const status = await sut.fetchBundleStatus(ENTITY_ID, 'webgl')
      expect(status).toBe(Registry.SimplifiedStatus.COMPLETE)
    })

    it('should return FAILED for manifest with error status', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      const manifest = createManifest(ManifestStatusCode.ASSET_BUNDLE_BUILD_FAIL)
      mockFetch.fetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const status = await sut.fetchBundleStatus(ENTITY_ID, 'webgl')
      expect(status).toBe(Registry.SimplifiedStatus.FAILED)
    })

    it('should return PENDING when manifest is not found (404)', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      mockFetch.fetch.mockResolvedValue({
        ok: false,
        status: 404
      })

      const status = await sut.fetchBundleStatus(ENTITY_ID, 'webgl')
      expect(status).toBe(Registry.SimplifiedStatus.PENDING)
    })

    it('should throw error for non-404 fetch failures', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      mockFetch.fetch.mockResolvedValue({
        ok: false,
        status: 500
      })

      await expect(sut.fetchBundleStatus(ENTITY_ID, 'webgl')).rejects.toThrow('Failed to fetch bundle status')
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

      const manifest = createManifest(ManifestStatusCode.SUCCESS)
      mockFetch.fetch.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(manifest)
      })

      const status = await sut.fetchBundleStatus(ENTITY_ID, 'webgl')
      expect(status).toBe(Registry.SimplifiedStatus.COMPLETE)
      expect(mockFetch.fetch).toHaveBeenCalledTimes(2)
    })

    it('should fail after max retries', async () => {
      const sut: EntityStatusFetcher = await createEntityStatusFetcherComponent({ fetch: mockFetch, logs, config })

      mockFetch.fetch.mockRejectedValue(new Error('ECONNRESET'))

      await expect(sut.fetchBundleStatus(ENTITY_ID, 'webgl')).rejects.toThrow('ECONNRESET')
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
