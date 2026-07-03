import { Registry } from '../../../src/types'
import { bundlesWithWebglCompat, versionsWithWebglCompat, withWebglCompat } from '../../../src/utils/webgl-compat'

describe('webgl backward-compatibility shim', () => {
  describe('when adding webgl compat to bundles', () => {
    describe('and the bundles have no stored webgl value', () => {
      let bundles: Registry.Bundles

      beforeEach(() => {
        bundles = {
          assets: { windows: Registry.SimplifiedStatus.COMPLETE, mac: Registry.SimplifiedStatus.FAILED },
          lods: { windows: Registry.SimplifiedStatus.PENDING, mac: Registry.SimplifiedStatus.COMPLETE }
        }
      })

      it('should default the assets webgl status to pending', () => {
        expect(bundlesWithWebglCompat(bundles).assets.webgl).toBe(Registry.SimplifiedStatus.PENDING)
      })

      it('should default the lods webgl status to pending', () => {
        expect(bundlesWithWebglCompat(bundles).lods?.webgl).toBe(Registry.SimplifiedStatus.PENDING)
      })

      it('should preserve the existing windows and mac statuses', () => {
        const result = bundlesWithWebglCompat(bundles)
        expect(result.assets).toEqual({
          windows: Registry.SimplifiedStatus.COMPLETE,
          mac: Registry.SimplifiedStatus.FAILED,
          webgl: Registry.SimplifiedStatus.PENDING
        })
      })
    })

    describe('and the bundles already have a stored webgl value', () => {
      let bundles: Registry.Bundles

      beforeEach(() => {
        bundles = {
          assets: {
            windows: Registry.SimplifiedStatus.COMPLETE,
            mac: Registry.SimplifiedStatus.COMPLETE,
            webgl: Registry.SimplifiedStatus.COMPLETE
          } as Registry.Bundles['assets'],
          lods: { windows: Registry.SimplifiedStatus.COMPLETE, mac: Registry.SimplifiedStatus.COMPLETE }
        }
      })

      it('should preserve the stored webgl status instead of overwriting it', () => {
        expect(bundlesWithWebglCompat(bundles).assets.webgl).toBe(Registry.SimplifiedStatus.COMPLETE)
      })
    })

    describe('and the bundles have no lods', () => {
      let bundles: Registry.Bundles

      beforeEach(() => {
        bundles = {
          assets: { windows: Registry.SimplifiedStatus.COMPLETE, mac: Registry.SimplifiedStatus.COMPLETE }
        }
      })

      it('should not add a lods section', () => {
        expect(bundlesWithWebglCompat(bundles).lods).toBeUndefined()
      })
    })
  })

  describe('when adding webgl compat to versions', () => {
    describe('and the versions have no stored webgl value', () => {
      let versions: Registry.Versions

      beforeEach(() => {
        versions = {
          assets: {
            windows: { version: 'v5', buildDate: '2024-01-15' },
            mac: { version: 'v5', buildDate: '2024-01-15' }
          }
        }
      })

      it('should default the webgl version info to empty values', () => {
        expect(versionsWithWebglCompat(versions)?.assets.webgl).toEqual({ version: '', buildDate: '' })
      })
    })

    describe('and the versions already have a stored webgl value', () => {
      let versions: Registry.Versions

      beforeEach(() => {
        versions = {
          assets: {
            windows: { version: 'v5', buildDate: '2024-01-15' },
            mac: { version: 'v5', buildDate: '2024-01-15' },
            webgl: { version: 'v4', buildDate: '2023-01-01' }
          } as Registry.Versions['assets']
        }
      })

      it('should preserve the stored webgl version info', () => {
        expect(versionsWithWebglCompat(versions)?.assets.webgl).toEqual({ version: 'v4', buildDate: '2023-01-01' })
      })
    })

    describe('and the versions are null', () => {
      it('should pass the null value through untouched', () => {
        expect(versionsWithWebglCompat(null)).toBeNull()
      })
    })
  })

  describe('when adding webgl compat to a registry entity', () => {
    let entity: { bundles: Registry.Bundles; versions: Registry.Versions; id: string }

    beforeEach(() => {
      entity = {
        id: 'baf1',
        bundles: {
          assets: { windows: Registry.SimplifiedStatus.COMPLETE, mac: Registry.SimplifiedStatus.COMPLETE },
          lods: { windows: Registry.SimplifiedStatus.PENDING, mac: Registry.SimplifiedStatus.PENDING }
        },
        versions: {
          assets: {
            windows: { version: 'v5', buildDate: '2024-01-15' },
            mac: { version: 'v5', buildDate: '2024-01-15' }
          }
        }
      }
    })

    it('should add webgl defaults to assets, lods and versions', () => {
      const result = withWebglCompat(entity)
      expect(result.bundles.assets.webgl).toBe(Registry.SimplifiedStatus.PENDING)
      expect(result.bundles.lods?.webgl).toBe(Registry.SimplifiedStatus.PENDING)
      expect(result.versions?.assets.webgl).toEqual({ version: '', buildDate: '' })
    })

    it('should preserve unrelated entity fields', () => {
      expect(withWebglCompat(entity).id).toBe('baf1')
    })
  })
})
