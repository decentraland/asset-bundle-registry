import { createCoordinatesComponent } from '../../../../src/logic/coordinates/component'
import { createDbMockComponent } from '../../mocks/db'
import { createLogMockComponent } from '../../mocks/logs'
import { SpawnRecalculationParams } from '../../../../src/types'

describe('when using the coordinates component', () => {
  let logs: ReturnType<typeof createLogMockComponent>
  let db: ReturnType<typeof createDbMockComponent>
  let component: ReturnType<typeof createCoordinatesComponent>

  beforeEach(() => {
    logs = createLogMockComponent()
    db = createDbMockComponent()
    component = createCoordinatesComponent({ db, logs })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and recalculating spawn coordinate if needed', () => {
    let capturedCallback: ((params: SpawnRecalculationParams) => any) | null
    let eventTimestamp: number

    beforeEach(() => {
      capturedCallback = null
      eventTimestamp = Date.now()
      db.recalculateSpawnCoordinate.mockImplementation(async (_worldName, _timestamp, callback) => {
        if (capturedCallback === null) {
          capturedCallback = callback
        }
      })
    })

    it('should recalculate the spawn coordinate for the normalized world name', async () => {
      await component.recalculateSpawnIfNeeded('Test-World', eventTimestamp)

      expect(db.recalculateSpawnCoordinate).toHaveBeenCalledWith('test-world', eventTimestamp, expect.any(Function))
    })

    describe('and the callback is invoked with no processed scenes', () => {
      it('should return delete action', async () => {
        await component.recalculateSpawnIfNeeded('test-world', eventTimestamp)

        const result = capturedCallback!({
          worldName: 'test-world',
          boundingRectangle: null,
          currentSpawn: null
        })

        expect(result).toEqual({ action: 'delete' })
      })
    })

    describe('and the callback is invoked with processed scenes but no spawn coordinate', () => {
      it('should return upsert action with calculated center', async () => {
        await component.recalculateSpawnIfNeeded('test-world', eventTimestamp)

        const result = capturedCallback!({
          worldName: 'test-world',
          boundingRectangle: { minX: 0, maxX: 2, minY: 0, maxY: 0 },
          currentSpawn: null
        })

        expect(result).toEqual({ action: 'upsert', x: 1, y: 0, isUserSet: false })
      })
    })

    describe('and the callback is invoked with a non-user-set spawn coordinate', () => {
      it('should return upsert action with recalculated center', async () => {
        await component.recalculateSpawnIfNeeded('test-world', eventTimestamp)

        const result = capturedCallback!({
          worldName: 'test-world',
          boundingRectangle: { minX: 0, maxX: 4, minY: 0, maxY: 0 },
          currentSpawn: { worldName: 'test-world', x: 0, y: 0, isUserSet: false, timestamp: Date.now() }
        })

        expect(result).toEqual({ action: 'upsert', x: 2, y: 0, isUserSet: false })
      })
    })

    describe('and the callback is invoked with a user-set spawn coordinate that is still within bounds', () => {
      it('should return none action', async () => {
        await component.recalculateSpawnIfNeeded('test-world', eventTimestamp)

        const result = capturedCallback!({
          worldName: 'test-world',
          boundingRectangle: { minX: 0, maxX: 2, minY: 0, maxY: 0 },
          currentSpawn: { worldName: 'test-world', x: 1, y: 0, isUserSet: true, timestamp: Date.now() }
        })

        expect(result).toEqual({ action: 'none' })
      })
    })

    describe('and the callback is invoked with a user-set spawn coordinate that is no longer within bounds', () => {
      it('should return upsert action with recalculated center', async () => {
        await component.recalculateSpawnIfNeeded('test-world', eventTimestamp)

        const result = capturedCallback!({
          worldName: 'test-world',
          boundingRectangle: { minX: 5, maxX: 7, minY: 5, maxY: 5 },
          currentSpawn: { worldName: 'test-world', x: 0, y: 0, isUserSet: true, timestamp: Date.now() }
        })

        expect(result).toEqual({ action: 'upsert', x: 6, y: 5, isUserSet: false })
      })
    })
  })

  describe('and calling setUserSpawnCoordinate', () => {
    let eventTimestamp: number

    beforeEach(() => {
      eventTimestamp = Date.now()
    })

    describe('and the coordinate is within the world bounds', () => {
      beforeEach(() => {
        db.setSpawnCoordinate.mockResolvedValue({
          boundingRectangle: { minX: 0, maxX: 2, minY: 0, maxY: 0 },
          updated: true
        })
      })

      it('should store the spawn coordinate as user-set', async () => {
        await component.setUserSpawnCoordinate('test-world', { x: 1, y: 0 }, eventTimestamp)

        expect(db.setSpawnCoordinate).toHaveBeenCalledWith('test-world', 1, 0, true, eventTimestamp)
      })
    })

    describe('and the coordinate is not within the world bounds', () => {
      beforeEach(() => {
        db.setSpawnCoordinate.mockResolvedValue({
          boundingRectangle: { minX: 0, maxX: 2, minY: 0, maxY: 0 },
          updated: true
        })
      })

      it('should still store the spawn coordinate as user-set', async () => {
        await component.setUserSpawnCoordinate('test-world', { x: 99, y: 99 }, eventTimestamp)

        expect(db.setSpawnCoordinate).toHaveBeenCalledWith('test-world', 99, 99, true, eventTimestamp)
      })
    })

    describe('and the world has no processed scenes', () => {
      beforeEach(() => {
        db.setSpawnCoordinate.mockResolvedValue({
          boundingRectangle: null,
          updated: true
        })
      })

      it('should still store the spawn coordinate as user-set', async () => {
        await component.setUserSpawnCoordinate('test-world', { x: 5, y: 10 }, eventTimestamp)

        expect(db.setSpawnCoordinate).toHaveBeenCalledWith('test-world', 5, 10, true, eventTimestamp)
      })
    })

    describe('and the update is skipped due to older timestamp', () => {
      beforeEach(() => {
        db.setSpawnCoordinate.mockResolvedValue({
          boundingRectangle: { minX: 0, maxX: 2, minY: 0, maxY: 0 },
          updated: false
        })
      })

      it('should not throw an error', async () => {
        await expect(
          component.setUserSpawnCoordinate('test-world', { x: 1, y: 0 }, eventTimestamp)
        ).resolves.not.toThrow()
      })
    })
  })

  describe('and calling getWorldManifest', () => {
    describe('and the world has processed scenes and a stored spawn coordinate', () => {
      beforeEach(() => {
        db.getWorldManifestData.mockResolvedValue({
          parcels: ['0,0', '1,0', '2,0'],
          spawnCoordinate: {
            worldName: 'test-world',
            x: 1,
            y: 0,
            isUserSet: true,
            timestamp: Date.now()
          }
        })
      })

      it('should return the manifest with the stored spawn coordinate', async () => {
        const manifest = await component.getWorldManifest('test-world')

        expect(manifest).toEqual({
          occupied: ['0,0', '1,0', '2,0'],
          spawn_coordinate: { x: 1, y: 0 },
          total: 3
        })
      })
    })

    describe('and the world has processed scenes but no stored spawn coordinate', () => {
      beforeEach(() => {
        db.getWorldManifestData.mockResolvedValue({
          parcels: ['0,0', '1,0', '2,0'],
          spawnCoordinate: null
        })
      })

      it('should return the manifest with the calculated center spawn coordinate', async () => {
        const manifest = await component.getWorldManifest('test-world')

        expect(manifest).toEqual({
          occupied: ['0,0', '1,0', '2,0'],
          spawn_coordinate: { x: 1, y: 0 },
          total: 3
        })
      })
    })

    describe('and the world has no processed scenes', () => {
      beforeEach(() => {
        db.getWorldManifestData.mockResolvedValue({
          parcels: [],
          spawnCoordinate: null
        })
      })

      it('should return an empty manifest with default spawn coordinate', async () => {
        const manifest = await component.getWorldManifest('test-world')

        expect(manifest).toEqual({
          occupied: [],
          spawn_coordinate: { x: 0, y: 0 },
          total: 0
        })
      })
    })
  })
})
