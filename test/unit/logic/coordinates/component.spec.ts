import {
  createCoordinatesComponent,
  parseCoordinate,
  formatCoordinate,
  calculateCenter,
  isCoordinateInParcels
} from '../../../../src/logic/coordinates/component'
import { createDbMockComponent } from '../../mocks/db'
import { createLogMockComponent } from '../../mocks/logs'

describe('when using coordinate utility functions', () => {
  describe('and calling parseCoordinate', () => {
    describe('and the coordinate is positive', () => {
      it('should parse correctly', () => {
        expect(parseCoordinate('5,10')).toEqual({ x: 5, y: 10 })
      })
    })

    describe('and the coordinate is negative', () => {
      it('should parse correctly', () => {
        expect(parseCoordinate('-5,-10')).toEqual({ x: -5, y: -10 })
      })
    })

    describe('and the coordinate is mixed', () => {
      it('should parse correctly', () => {
        expect(parseCoordinate('-53,71')).toEqual({ x: -53, y: 71 })
      })
    })

    describe('and the coordinate is zero', () => {
      it('should parse correctly', () => {
        expect(parseCoordinate('0,0')).toEqual({ x: 0, y: 0 })
      })
    })
  })

  describe('and calling formatCoordinate', () => {
    describe('and the coordinate is positive', () => {
      it('should format correctly', () => {
        expect(formatCoordinate({ x: 5, y: 10 })).toBe('5,10')
      })
    })

    describe('and the coordinate is negative', () => {
      it('should format correctly', () => {
        expect(formatCoordinate({ x: -5, y: -10 })).toBe('-5,-10')
      })
    })

    describe('and the coordinate is zero', () => {
      it('should format correctly', () => {
        expect(formatCoordinate({ x: 0, y: 0 })).toBe('0,0')
      })
    })
  })

  describe('and calling calculateCenter', () => {
    describe('and the parcels array is empty', () => {
      it('should return 0,0', () => {
        expect(calculateCenter([])).toEqual({ x: 0, y: 0 })
      })
    })

    describe('and there is a single parcel', () => {
      it('should return that parcel', () => {
        expect(calculateCenter(['5,10'])).toEqual({ x: 5, y: 10 })
      })
    })

    describe('and there are multiple parcels in a line', () => {
      it('should return the closest parcel to the center', () => {
        const result = calculateCenter(['0,0', '1,0', '2,0'])
        expect(result).toEqual({ x: 1, y: 0 })
      })
    })

    describe('and there are multiple parcels in a square', () => {
      it('should return a parcel closest to the center', () => {
        const result = calculateCenter(['0,0', '0,1', '1,0', '1,1'])
        expect(['0,0', '0,1', '1,0', '1,1']).toContain(formatCoordinate(result))
      })
    })

    describe('and the parcels have negative coordinates', () => {
      it('should calculate correctly', () => {
        const result = calculateCenter(['-1,-1', '-1,0', '0,-1', '0,0'])
        expect(['-1,-1', '-1,0', '0,-1', '0,0']).toContain(formatCoordinate(result))
      })
    })
  })

  describe('and calling isCoordinateInParcels', () => {
    describe('and the coordinate is in the parcels', () => {
      it('should return true', () => {
        expect(isCoordinateInParcels({ x: 5, y: 10 }, ['0,0', '5,10', '10,20'])).toBe(true)
      })
    })

    describe('and the coordinate is not in the parcels', () => {
      it('should return false', () => {
        expect(isCoordinateInParcels({ x: 5, y: 10 }, ['0,0', '10,20'])).toBe(false)
      })
    })

    describe('and the parcels array is empty', () => {
      it('should return false', () => {
        expect(isCoordinateInParcels({ x: 5, y: 10 }, [])).toBe(false)
      })
    })

    describe('and the coordinate has different case', () => {
      it('should still match case-insensitively', () => {
        expect(isCoordinateInParcels({ x: 5, y: 10 }, ['5,10'])).toBe(true)
      })
    })
  })
})

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

  describe('and calling recalculateSpawnIfNeeded', () => {
    describe('and the world has no processed scenes', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue([])
      })

      it('should delete the spawn coordinate', async () => {
        await component.recalculateSpawnIfNeeded('test-world')

        expect(db.deleteSpawnCoordinate).toHaveBeenCalledWith('test-world')
      })
    })

    describe('and the world has processed scenes but no spawn coordinate', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue(['0,0', '1,0', '2,0'])
        db.getSpawnCoordinate.mockResolvedValue(null)
      })

      it('should calculate and set the center as spawn coordinate', async () => {
        await component.recalculateSpawnIfNeeded('test-world')

        expect(db.upsertSpawnCoordinate).toHaveBeenCalledWith('test-world', 1, 0, false)
      })
    })

    describe('and the world has a non-user-set spawn coordinate', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue(['0,0', '1,0', '2,0', '3,0'])
        db.getSpawnCoordinate.mockResolvedValue({
          worldName: 'test-world',
          x: 0,
          y: 0,
          isUserSet: false,
          timestamp: Date.now()
        })
      })

      it('should recalculate and update the spawn coordinate to the new center', async () => {
        await component.recalculateSpawnIfNeeded('test-world')

        expect(db.upsertSpawnCoordinate).toHaveBeenCalled()
        const callArgs = db.upsertSpawnCoordinate.mock.calls[0]
        expect(callArgs[0]).toBe('test-world')
        expect(callArgs[3]).toBe(false)
      })
    })

    describe('and the world has a user-set spawn coordinate that is still valid', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue(['0,0', '1,0', '2,0'])
        db.getSpawnCoordinate.mockResolvedValue({
          worldName: 'test-world',
          x: 1,
          y: 0,
          isUserSet: true,
          timestamp: Date.now()
        })
      })

      it('should not update the spawn coordinate', async () => {
        await component.recalculateSpawnIfNeeded('test-world')

        expect(db.upsertSpawnCoordinate).not.toHaveBeenCalled()
      })
    })

    describe('and the world has a user-set spawn coordinate that is no longer valid', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue(['5,5', '6,5', '7,5'])
        db.getSpawnCoordinate.mockResolvedValue({
          worldName: 'test-world',
          x: 0,
          y: 0,
          isUserSet: true,
          timestamp: Date.now()
        })
      })

      it('should recalculate and update the spawn coordinate to the new center', async () => {
        await component.recalculateSpawnIfNeeded('test-world')

        expect(db.upsertSpawnCoordinate).toHaveBeenCalledWith('test-world', 6, 5, false)
      })
    })
  })

  describe('and calling setUserSpawnCoordinate', () => {
    describe('and the coordinate is within the world shape', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue(['0,0', '1,0', '2,0'])
      })

      it('should set the spawn coordinate with isUserSet true', async () => {
        await component.setUserSpawnCoordinate('test-world', { x: 1, y: 0 })

        expect(db.upsertSpawnCoordinate).toHaveBeenCalledWith('test-world', 1, 0, true)
      })
    })

    describe('and the coordinate is not within the world shape', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue(['0,0', '1,0', '2,0'])
      })

      it('should still set the spawn coordinate with isUserSet true', async () => {
        await component.setUserSpawnCoordinate('test-world', { x: 99, y: 99 })

        expect(db.upsertSpawnCoordinate).toHaveBeenCalledWith('test-world', 99, 99, true)
      })
    })

    describe('and the world has no processed scenes', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue([])
      })

      it('should still set the spawn coordinate with isUserSet true', async () => {
        await component.setUserSpawnCoordinate('test-world', { x: 5, y: 10 })

        expect(db.upsertSpawnCoordinate).toHaveBeenCalledWith('test-world', 5, 10, true)
      })
    })
  })

  describe('and calling getWorldManifest', () => {
    describe('and the world has processed scenes and a stored spawn coordinate', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue(['0,0', '1,0', '2,0'])
        db.getSpawnCoordinate.mockResolvedValue({
          worldName: 'test-world',
          x: 1,
          y: 0,
          isUserSet: true,
          timestamp: Date.now()
        })
      })

      it('should return the manifest with the stored spawn coordinate', async () => {
        const manifest = await component.getWorldManifest('test-world')

        expect(manifest).toEqual({
          occupied: ['0,0', '1,0', '2,0'],
          spawn_coordinate: { x: '1', y: '0' },
          total: 3
        })
      })
    })

    describe('and the world has processed scenes but no stored spawn coordinate', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue(['0,0', '1,0', '2,0'])
        db.getSpawnCoordinate.mockResolvedValue(null)
      })

      it('should return the manifest with the calculated center spawn coordinate', async () => {
        const manifest = await component.getWorldManifest('test-world')

        expect(manifest).toEqual({
          occupied: ['0,0', '1,0', '2,0'],
          spawn_coordinate: { x: '1', y: '0' },
          total: 3
        })
      })
    })

    describe('and the world has no processed scenes', () => {
      beforeEach(() => {
        db.getProcessedWorldParcels.mockResolvedValue([])
        db.getSpawnCoordinate.mockResolvedValue(null)
      })

      it('should return an empty manifest with default spawn coordinate', async () => {
        const manifest = await component.getWorldManifest('test-world')

        expect(manifest).toEqual({
          occupied: [],
          spawn_coordinate: { x: '0', y: '0' },
          total: 0
        })
      })
    })
  })
})
