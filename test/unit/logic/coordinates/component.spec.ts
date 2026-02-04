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

  describe('and parsing a coordinate', () => {
    describe('and the coordinate has a valid format', () => {
      it('should return the parsed coordinate', () => {
        const result = component.parseCoordinate('10,20')

        expect(result).toEqual({ x: 10, y: 20 })
      })
    })

    describe('and the coordinate has negative values', () => {
      it('should return the parsed coordinate with negative values', () => {
        const result = component.parseCoordinate('-5,-10')

        expect(result).toEqual({ x: -5, y: -10 })
      })
    })

    describe('and the coordinate is at the minimum bounds', () => {
      it('should return the parsed coordinate', () => {
        const result = component.parseCoordinate('-150,-150')

        expect(result).toEqual({ x: -150, y: -150 })
      })
    })

    describe('and the coordinate is at the maximum bounds', () => {
      it('should return the parsed coordinate', () => {
        const result = component.parseCoordinate('150,150')

        expect(result).toEqual({ x: 150, y: 150 })
      })
    })

    describe('and the coordinate has an invalid format with only one part', () => {
      it('should throw an error', () => {
        expect(() => component.parseCoordinate('10')).toThrow('Invalid coordinate format: 10')
      })
    })

    describe('and the coordinate has an invalid format with more than two parts', () => {
      it('should throw an error', () => {
        expect(() => component.parseCoordinate('10,20,30')).toThrow('Invalid coordinate format: 10,20,30')
      })
    })

    describe('and the coordinate has a non-numeric x value', () => {
      it('should throw an error', () => {
        expect(() => component.parseCoordinate('abc,20')).toThrow('Invalid coordinate values: abc,20')
      })
    })

    describe('and the coordinate has a non-numeric y value', () => {
      it('should throw an error', () => {
        expect(() => component.parseCoordinate('10,xyz')).toThrow('Invalid coordinate values: 10,xyz')
      })
    })

    describe('and the x value is below the minimum bound', () => {
      it('should throw an error', () => {
        expect(() => component.parseCoordinate('-151,0')).toThrow(
          'Coordinate X value -151 is out of bounds. Must be between -150 and 150.'
        )
      })
    })

    describe('and the x value is above the maximum bound', () => {
      it('should throw an error', () => {
        expect(() => component.parseCoordinate('151,0')).toThrow(
          'Coordinate X value 151 is out of bounds. Must be between -150 and 150.'
        )
      })
    })

    describe('and the y value is below the minimum bound', () => {
      it('should throw an error', () => {
        expect(() => component.parseCoordinate('0,-151')).toThrow(
          'Coordinate Y value -151 is out of bounds. Must be between -150 and 150.'
        )
      })
    })

    describe('and the y value is above the maximum bound', () => {
      it('should throw an error', () => {
        expect(() => component.parseCoordinate('0,151')).toThrow(
          'Coordinate Y value 151 is out of bounds. Must be between -150 and 150.'
        )
      })
    })
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
      describe('and entityBaseCoordinate is provided', () => {
        it('should return upsert action with the base coordinate', async () => {
          await component.recalculateSpawnIfNeeded('test-world', eventTimestamp, '5,10')

          const result = capturedCallback!({
            worldName: 'test-world',
            boundingRectangle: { minX: 0, maxX: 10, minY: 0, maxY: 10 },
            currentSpawn: null,
            entityBaseCoordinate: '5,10'
          })

          expect(result).toEqual({ action: 'upsert', x: 5, y: 10, isUserSet: false })
        })
      })

      describe('and entityBaseCoordinate is not provided', () => {
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
    })

    describe('and the callback is invoked with a non-user-set spawn coordinate that is within bounds', () => {
      it('should return none action to keep the existing spawn', async () => {
        await component.recalculateSpawnIfNeeded('test-world', eventTimestamp)

        const result = capturedCallback!({
          worldName: 'test-world',
          boundingRectangle: { minX: 0, maxX: 4, minY: 0, maxY: 0 },
          currentSpawn: { worldName: 'test-world', x: 0, y: 0, isUserSet: false, timestamp: Date.now() }
        })

        expect(result).toEqual({ action: 'none' })
      })
    })

    describe('and the callback is invoked with a non-user-set spawn coordinate that is outside bounds', () => {
      it('should return upsert action with recalculated center', async () => {
        await component.recalculateSpawnIfNeeded('test-world', eventTimestamp)

        const result = capturedCallback!({
          worldName: 'test-world',
          boundingRectangle: { minX: 5, maxX: 9, minY: 5, maxY: 5 },
          currentSpawn: { worldName: 'test-world', x: 0, y: 0, isUserSet: false, timestamp: Date.now() }
        })

        expect(result).toEqual({ action: 'upsert', x: 7, y: 5, isUserSet: false })
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

    describe('and the x coordinate is below the minimum parcel bound', () => {
      it('should throw an error', async () => {
        await expect(component.setUserSpawnCoordinate('test-world', { x: -151, y: 0 }, eventTimestamp)).rejects.toThrow(
          'Coordinate -151,0 is out of bounds'
        )
      })
    })

    describe('and the x coordinate is above the maximum parcel bound', () => {
      it('should throw an error', async () => {
        await expect(component.setUserSpawnCoordinate('test-world', { x: 151, y: 0 }, eventTimestamp)).rejects.toThrow(
          'Coordinate 151,0 is out of bounds'
        )
      })
    })

    describe('and the y coordinate is below the minimum parcel bound', () => {
      it('should throw an error', async () => {
        await expect(component.setUserSpawnCoordinate('test-world', { x: 0, y: -151 }, eventTimestamp)).rejects.toThrow(
          'Coordinate 0,-151 is out of bounds'
        )
      })
    })

    describe('and the y coordinate is above the maximum parcel bound', () => {
      it('should throw an error', async () => {
        await expect(component.setUserSpawnCoordinate('test-world', { x: 0, y: 151 }, eventTimestamp)).rejects.toThrow(
          'Coordinate 0,151 is out of bounds'
        )
      })
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
    describe('and the world has processed scenes and a stored spawn coordinate within bounds', () => {
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

    describe('and the world has processed scenes and a stored spawn coordinate outside bounds', () => {
      beforeEach(() => {
        db.getWorldManifestData.mockResolvedValue({
          parcels: ['0,0', '1,0', '2,0'],
          spawnCoordinate: {
            worldName: 'test-world',
            x: 99,
            y: 99,
            isUserSet: true,
            timestamp: Date.now()
          }
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
