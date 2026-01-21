import { createPointersComponent, IPointersComponent } from '../../../src/logic/pointers'

describe('Pointers Logic Component', () => {
  let pointers: IPointersComponent

  beforeEach(() => {
    pointers = createPointersComponent()
  })

  describe('when converting to a world scene pointer', () => {
    describe('and creating from world name and coordinates', () => {
      let worldName: string
      let coordinates: string

      beforeEach(() => {
        worldName = 'myworld.dcl.eth'
        coordinates = '0,0'
      })

      it('should return the formatted world scene pointer', () => {
        expect(pointers.toWorldScenePointer(worldName, coordinates)).toBe('myworld.dcl.eth:0,0')
      })
    })

    describe('and the world name has uppercase letters', () => {
      let worldName: string
      let coordinates: string

      beforeEach(() => {
        worldName = 'MyWorld.dcl.eth'
        coordinates = '0,0'
      })

      it('should lowercase the world name', () => {
        expect(pointers.toWorldScenePointer(worldName, coordinates)).toBe('myworld.dcl.eth:0,0')
      })
    })

    describe('and coordinates are negative', () => {
      let worldName: string
      let coordinates: string

      beforeEach(() => {
        worldName = 'myworld.dcl.eth'
        coordinates = '-5,10'
      })

      it('should handle negative coordinates', () => {
        expect(pointers.toWorldScenePointer(worldName, coordinates)).toBe('myworld.dcl.eth:-5,10')
      })
    })
  })

  describe('when converting multiple coordinates to world scene pointers', () => {
    describe('and the coordinates are provided', () => {
      let worldName: string
      let coordinates: string[]

      beforeEach(() => {
        worldName = 'myworld.dcl.eth'
        coordinates = ['0,0', '1,0', '0,1']
      })

      it('should return an array of world scene pointers', () => {
        const result = pointers.toWorldScenePointers(worldName, coordinates)

        expect(result).toEqual(['myworld.dcl.eth:0,0', 'myworld.dcl.eth:1,0', 'myworld.dcl.eth:0,1'])
      })
    })
  })

  describe('when checking if a pointer is a world scene pointer', () => {
    describe('and the pointer is a valid world scene pointer', () => {
      describe('and the pointer has worldname:coordinates format', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'myworld.dcl.eth:0,0'
        })

        it('should return true', () => {
          expect(pointers.isWorldScenePointer(pointer)).toBe(true)
        })
      })

      describe('and the world name contains hyphens', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'another-world.dcl.eth:-5,10'
        })

        it('should return true', () => {
          expect(pointers.isWorldScenePointer(pointer)).toBe(true)
        })
      })

      describe('and the world name has a short domain', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'test.eth:100,-50'
        })

        it('should return true', () => {
          expect(pointers.isWorldScenePointer(pointer)).toBe(true)
        })
      })
    })

    describe('and the pointer is a Genesis City coordinate', () => {
      describe('and the coordinates are negative', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '-53,71'
        })

        it('should return false', () => {
          expect(pointers.isWorldScenePointer(pointer)).toBe(false)
        })
      })

      describe('and the coordinates are zero', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '0,0'
        })

        it('should return false', () => {
          expect(pointers.isWorldScenePointer(pointer)).toBe(false)
        })
      })

      describe('and the coordinates have mixed positive and negative values', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '100,-50'
        })

        it('should return false', () => {
          expect(pointers.isWorldScenePointer(pointer)).toBe(false)
        })
      })
    })

    describe('and the pointer is a legacy world pointer', () => {
      describe('and the pointer is a world name without coordinates', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'myworld.dcl.eth'
        })

        it('should return false', () => {
          expect(pointers.isWorldScenePointer(pointer)).toBe(false)
        })
      })

      describe('and the pointer has another world name format', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'another-world.dcl.eth'
        })

        it('should return false', () => {
          expect(pointers.isWorldScenePointer(pointer)).toBe(false)
        })
      })
    })

    describe('and the pointer has no colons', () => {
      let pointer: string

      beforeEach(() => {
        pointer = 'myworld'
      })

      it('should return false', () => {
        expect(pointers.isWorldScenePointer(pointer)).toBe(false)
      })
    })
  })

  describe('when checking if a pointer is a legacy world pointer', () => {
    describe('and the pointer is a legacy world pointer', () => {
      describe('and the pointer has dcl.eth domain', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'myworld.dcl.eth'
        })

        it('should return true', () => {
          expect(pointers.isLegacyWorldPointer(pointer)).toBe(true)
        })
      })

      describe('and the world name contains hyphens', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'another-world.dcl.eth'
        })

        it('should return true', () => {
          expect(pointers.isLegacyWorldPointer(pointer)).toBe(true)
        })
      })

      describe('and the pointer has a short domain', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'test.eth'
        })

        it('should return true', () => {
          expect(pointers.isLegacyWorldPointer(pointer)).toBe(true)
        })
      })
    })

    describe('and the pointer is a Genesis City coordinate', () => {
      describe('and the coordinates are negative', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '-53,71'
        })

        it('should return false', () => {
          expect(pointers.isLegacyWorldPointer(pointer)).toBe(false)
        })
      })

      describe('and the coordinates are zero', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '0,0'
        })

        it('should return false', () => {
          expect(pointers.isLegacyWorldPointer(pointer)).toBe(false)
        })
      })
    })

    describe('and the pointer is a world scene pointer', () => {
      let pointer: string

      beforeEach(() => {
        pointer = 'myworld.dcl.eth:0,0'
      })

      it('should return false', () => {
        expect(pointers.isLegacyWorldPointer(pointer)).toBe(false)
      })
    })
  })

  describe('when parsing a pointer', () => {
    describe('and the pointer is a Genesis City pointer', () => {
      describe('and the pointer has simple coordinates', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '0,0'
        })

        it('should return genesis type with coordinates', () => {
          const result = pointers.parsePointer(pointer)

          expect(result).toEqual({ type: 'genesis', coordinates: '0,0' })
        })
      })

      describe('and the pointer has negative coordinates', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '-53,71'
        })

        it('should return genesis type with coordinates', () => {
          const result = pointers.parsePointer(pointer)

          expect(result).toEqual({ type: 'genesis', coordinates: '-53,71' })
        })
      })

      describe('and the pointer has negative values on both axes', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '-100,-50'
        })

        it('should return genesis type with coordinates', () => {
          const result = pointers.parsePointer(pointer)

          expect(result).toEqual({ type: 'genesis', coordinates: '-100,-50' })
        })
      })

      describe('and the pointer has positive values', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '100,50'
        })

        it('should return genesis type with coordinates', () => {
          const result = pointers.parsePointer(pointer)

          expect(result).toEqual({ type: 'genesis', coordinates: '100,50' })
        })
      })
    })

    describe('and the pointer is a world scene pointer', () => {
      describe('and the pointer has standard format', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'myworld.dcl.eth:0,0'
        })

        it('should return world-scene type with world name and coordinates', () => {
          const result = pointers.parsePointer(pointer)

          expect(result).toEqual({
            type: 'world-scene',
            worldName: 'myworld.dcl.eth',
            coordinates: '0,0'
          })
        })
      })

      describe('and the pointer has negative coordinates', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'myworld.dcl.eth:-5,10'
        })

        it('should return world-scene type with world name and coordinates', () => {
          const result = pointers.parsePointer(pointer)

          expect(result).toEqual({
            type: 'world-scene',
            worldName: 'myworld.dcl.eth',
            coordinates: '-5,10'
          })
        })
      })

      describe('and the pointer has uppercase letters', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'MyWorld.DCL.ETH:0,0'
        })

        it('should lowercase world names', () => {
          const result = pointers.parsePointer(pointer)

          expect(result).toEqual({
            type: 'world-scene',
            worldName: 'myworld.dcl.eth',
            coordinates: '0,0'
          })
        })
      })

      describe('and the world name has multiple dots', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'my.cool.world.dcl.eth:10,-20'
        })

        it('should handle the full world name', () => {
          const result = pointers.parsePointer(pointer)

          expect(result).toEqual({
            type: 'world-scene',
            worldName: 'my.cool.world.dcl.eth',
            coordinates: '10,-20'
          })
        })
      })
    })

    describe('and the pointer is a legacy world pointer', () => {
      describe('and the pointer is a standard world name', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'myworld.dcl.eth'
        })

        it('should return legacy-world type with world name', () => {
          const result = pointers.parsePointer(pointer)

          expect(result).toEqual({
            type: 'legacy-world',
            worldName: 'myworld.dcl.eth'
          })
        })
      })

      describe('and the pointer has uppercase letters', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'MyWorld.DCL.ETH'
        })

        it('should lowercase the world name', () => {
          const result = pointers.parsePointer(pointer)

          expect(result).toEqual({
            type: 'legacy-world',
            worldName: 'myworld.dcl.eth'
          })
        })
      })
    })
  })

  describe('when extracting the world name from a pointer', () => {
    describe('and the pointer is a world scene pointer', () => {
      let pointer: string

      beforeEach(() => {
        pointer = 'myworld.dcl.eth:0,0'
      })

      it('should extract the world name', () => {
        expect(pointers.extractWorldName(pointer)).toBe('myworld.dcl.eth')
      })
    })

    describe('and the pointer is a legacy world pointer', () => {
      let pointer: string

      beforeEach(() => {
        pointer = 'myworld.dcl.eth'
      })

      it('should extract the world name', () => {
        expect(pointers.extractWorldName(pointer)).toBe('myworld.dcl.eth')
      })
    })

    describe('and the pointer is a Genesis City coordinate', () => {
      describe('and the coordinates are negative', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '-53,71'
        })

        it('should return null', () => {
          expect(pointers.extractWorldName(pointer)).toBeNull()
        })
      })

      describe('and the coordinates are zero', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '0,0'
        })

        it('should return null', () => {
          expect(pointers.extractWorldName(pointer)).toBeNull()
        })
      })
    })
  })

  describe('when extracting coordinates from a pointer', () => {
    describe('and the pointer is a world scene pointer', () => {
      describe('and the coordinates are positive', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'myworld.dcl.eth:0,0'
        })

        it('should extract the coordinates', () => {
          expect(pointers.extractCoordinates(pointer)).toBe('0,0')
        })
      })

      describe('and the coordinates are negative', () => {
        let pointer: string

        beforeEach(() => {
          pointer = 'myworld.dcl.eth:-5,10'
        })

        it('should extract the coordinates', () => {
          expect(pointers.extractCoordinates(pointer)).toBe('-5,10')
        })
      })
    })

    describe('and the pointer is a Genesis City pointer', () => {
      describe('and the coordinates are negative', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '-53,71'
        })

        it('should extract the coordinates', () => {
          expect(pointers.extractCoordinates(pointer)).toBe('-53,71')
        })
      })

      describe('and the coordinates are zero', () => {
        let pointer: string

        beforeEach(() => {
          pointer = '0,0'
        })

        it('should extract the coordinates', () => {
          expect(pointers.extractCoordinates(pointer)).toBe('0,0')
        })
      })
    })

    describe('and the pointer is a legacy world pointer', () => {
      let pointer: string

      beforeEach(() => {
        pointer = 'myworld.dcl.eth'
      })

      it('should return null', () => {
        expect(pointers.extractCoordinates(pointer)).toBeNull()
      })
    })
  })

  describe('when handling a multi-world query scenario', () => {
    let inputPointers: string[]

    beforeEach(() => {
      inputPointers = ['world1.dcl.eth:0,0', 'world2.dcl.eth:0,0', '-53,71']
    })

    it('should correctly identify pointers from different worlds', () => {
      const parsed = inputPointers.map((p) => pointers.parsePointer(p))

      expect(parsed[0]).toEqual({
        type: 'world-scene',
        worldName: 'world1.dcl.eth',
        coordinates: '0,0'
      })
      expect(parsed[1]).toEqual({
        type: 'world-scene',
        worldName: 'world2.dcl.eth',
        coordinates: '0,0'
      })
      expect(parsed[2]).toEqual({
        type: 'genesis',
        coordinates: '-53,71'
      })
    })
  })

  describe('when handling backward compatibility scenarios', () => {
    describe('and the pointer is a legacy world pointer', () => {
      let legacyPointer: string

      beforeEach(() => {
        legacyPointer = 'myworld.dcl.eth'
      })

      it('should treat legacy world pointers as valid', () => {
        const parsed = pointers.parsePointer(legacyPointer)

        expect(parsed.type).toBe('legacy-world')
        expect((parsed as any).worldName).toBe('myworld.dcl.eth')
      })
    })

    describe('and distinguishing between legacy and new format', () => {
      let legacyPointer: string
      let newPointer: string

      beforeEach(() => {
        legacyPointer = 'myworld.dcl.eth'
        newPointer = 'myworld.dcl.eth:0,0'
      })

      it('should identify the legacy pointer correctly', () => {
        expect(pointers.isWorldScenePointer(legacyPointer)).toBe(false)
        expect(pointers.isLegacyWorldPointer(legacyPointer)).toBe(true)
      })

      it('should identify the new pointer correctly', () => {
        expect(pointers.isWorldScenePointer(newPointer)).toBe(true)
        expect(pointers.isLegacyWorldPointer(newPointer)).toBe(false)
      })
    })
  })

  describe('when transforming world pointers', () => {
    describe('and the entity has coordinate pointers (multi-scene world)', () => {
      let worldName: string
      let entityPointers: string[]

      beforeEach(() => {
        worldName = 'myworld.dcl.eth'
        entityPointers = ['0,0', '1,0', '0,1']
      })

      it('should transform coordinates to world-prefixed format', () => {
        const result = pointers.transformWorldPointers(worldName, entityPointers)

        expect(result).toEqual(['myworld.dcl.eth:0,0', 'myworld.dcl.eth:1,0', 'myworld.dcl.eth:0,1'])
      })
    })

    describe('and the entity has negative coordinate pointers', () => {
      let worldName: string
      let entityPointers: string[]

      beforeEach(() => {
        worldName = 'myworld.dcl.eth'
        entityPointers = ['-5,10', '0,0', '10,-20']
      })

      it('should transform all coordinates correctly', () => {
        const result = pointers.transformWorldPointers(worldName, entityPointers)

        expect(result).toEqual(['myworld.dcl.eth:-5,10', 'myworld.dcl.eth:0,0', 'myworld.dcl.eth:10,-20'])
      })
    })

    describe('and the world name has mixed casing', () => {
      let worldName: string
      let entityPointers: string[]

      beforeEach(() => {
        worldName = 'MyWorld.DCL.ETH'
        entityPointers = ['0,0']
      })

      it('should lowercase the world name in the result', () => {
        const result = pointers.transformWorldPointers(worldName, entityPointers)

        expect(result).toEqual(['myworld.dcl.eth:0,0'])
      })
    })

    describe('and the entity has non-coordinate pointers (single-scene/legacy world)', () => {
      let worldName: string
      let entityPointers: string[]

      beforeEach(() => {
        worldName = 'myworld.dcl.eth'
        entityPointers = ['myworld.dcl.eth']
      })

      it('should return just the lowercased world name', () => {
        const result = pointers.transformWorldPointers(worldName, entityPointers)

        expect(result).toEqual(['myworld.dcl.eth'])
      })
    })

    describe('and the entity has empty pointers array', () => {
      let worldName: string
      let entityPointers: string[]

      beforeEach(() => {
        worldName = 'myworld.dcl.eth'
        entityPointers = []
      })

      it('should return just the lowercased world name', () => {
        const result = pointers.transformWorldPointers(worldName, entityPointers)

        expect(result).toEqual(['myworld.dcl.eth'])
      })
    })

    describe('and the entity has mixed coordinate and non-coordinate pointers', () => {
      let worldName: string
      let entityPointers: string[]

      beforeEach(() => {
        worldName = 'myworld.dcl.eth'
        entityPointers = ['0,0', 'some-other-pointer', '1,0']
      })

      it('should transform coordinates and lowercase non-coordinates', () => {
        const result = pointers.transformWorldPointers(worldName, entityPointers)

        expect(result).toEqual(['myworld.dcl.eth:0,0', 'some-other-pointer', 'myworld.dcl.eth:1,0'])
      })
    })
  })
})
