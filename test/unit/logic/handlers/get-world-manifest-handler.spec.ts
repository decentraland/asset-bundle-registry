import { getWorldManifestHandler } from '../../../../src/controllers/handlers/get-world-manifest'
import { HandlerContextWithPath } from '../../../../src/types'
import { createCoordinatesMockComponent } from '../../mocks/coordinates'
import { WorldManifest } from '../../../../src/logic/coordinates/types'

describe('when handling get world manifest requests', () => {
  let coordinates: ReturnType<typeof createCoordinatesMockComponent>
  let context: HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>

  beforeEach(() => {
    coordinates = createCoordinatesMockComponent()
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the world name is valid', () => {
    describe('and the world name is in the format name.dcl.eth', () => {
      let mockManifest: WorldManifest

      beforeEach(() => {
        mockManifest = {
          occupied: ['0,0', '1,0', '0,1'],
          spawn_coordinate: { x: 0, y: 0 },
          total: 3
        }
        coordinates.getWorldManifest.mockResolvedValue(mockManifest)

        context = {
          params: { worldName: 'myworld.dcl.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 200 status, the manifest and the json content type header', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(200)
        expect(result.body).toEqual(mockManifest)
        expect(result.headers).toEqual({ 'Content-Type': 'application/json' })
      })

      it('should get the world manifest for the given world name', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).toHaveBeenCalledWith('myworld.dcl.eth')
      })
    })

    describe('and the world name is in the format name.eth', () => {
      let mockManifest: WorldManifest

      beforeEach(() => {
        mockManifest = {
          occupied: ['5,5'],
          spawn_coordinate: { x: 5, y: 5 },
          total: 1
        }
        coordinates.getWorldManifest.mockResolvedValue(mockManifest)

        context = {
          params: { worldName: 'myworld.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 200 status, the manifest and the json content type header', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(200)
        expect(result.body).toEqual(mockManifest)
        expect(result.headers).toEqual({ 'Content-Type': 'application/json' })
      })

      it('should get the world manifest for the given world name', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).toHaveBeenCalledWith('myworld.eth')
      })
    })

    describe('and the world name contains hyphens and numbers', () => {
      let mockManifest: WorldManifest

      beforeEach(() => {
        mockManifest = {
          occupied: [],
          spawn_coordinate: { x: 0, y: 0 },
          total: 0
        }
        coordinates.getWorldManifest.mockResolvedValue(mockManifest)

        context = {
          params: { worldName: 'my-world-123.dcl.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 200 status, the manifest and the json content type header', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(200)
        expect(result.body).toEqual(mockManifest)
        expect(result.headers).toEqual({ 'Content-Type': 'application/json' })
      })
    })

    describe('and the world name contains uppercase letters', () => {
      let mockManifest: WorldManifest

      beforeEach(() => {
        mockManifest = {
          occupied: ['1,1'],
          spawn_coordinate: { x: 1, y: 1 },
          total: 1
        }
        coordinates.getWorldManifest.mockResolvedValue(mockManifest)

        context = {
          params: { worldName: 'MyWorld.dcl.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 200 status, the manifest and the json content type header', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(200)
        expect(result.body).toEqual(mockManifest)
        expect(result.headers).toEqual({ 'Content-Type': 'application/json' })
      })

      it('should get the world manifest preserving the world name case', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).toHaveBeenCalledWith('MyWorld.dcl.eth')
      })
    })

    describe('and the world name starts with a number', () => {
      let mockManifest: WorldManifest

      beforeEach(() => {
        mockManifest = {
          occupied: ['2,2'],
          spawn_coordinate: { x: 2, y: 2 },
          total: 1
        }
        coordinates.getWorldManifest.mockResolvedValue(mockManifest)

        context = {
          params: { worldName: '123world.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 200 status, the manifest and the json content type header', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(200)
        expect(result.body).toEqual(mockManifest)
        expect(result.headers).toEqual({ 'Content-Type': 'application/json' })
      })
    })

    describe('and the world name starts with a hyphen', () => {
      let mockManifest: WorldManifest

      beforeEach(() => {
        mockManifest = {
          occupied: ['3,3'],
          spawn_coordinate: { x: 3, y: 3 },
          total: 1
        }
        coordinates.getWorldManifest.mockResolvedValue(mockManifest)

        context = {
          params: { worldName: '-myworld.dcl.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 200 status, the manifest and the json content type header', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(200)
        expect(result.body).toEqual(mockManifest)
        expect(result.headers).toEqual({ 'Content-Type': 'application/json' })
      })
    })
  })

  describe('and the world name is invalid', () => {
    describe('and the world name does not end with .eth', () => {
      beforeEach(() => {
        context = {
          params: { worldName: 'myworld.com' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 400 status and an error message', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(400)
        expect(result.body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })

      it('should not get the world manifest', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).not.toHaveBeenCalled()
      })
    })

    describe('and the world name is just a plain name without .eth suffix', () => {
      beforeEach(() => {
        context = {
          params: { worldName: 'myworld' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 400 status and an error message', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(400)
        expect(result.body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })

      it('should not get the world manifest', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).not.toHaveBeenCalled()
      })
    })

    describe('and the world name contains invalid characters', () => {
      beforeEach(() => {
        context = {
          params: { worldName: 'my_world!.dcl.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 400 status and an error message', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(400)
        expect(result.body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })

      it('should not get the world manifest', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).not.toHaveBeenCalled()
      })
    })

    describe('and the world name contains spaces', () => {
      beforeEach(() => {
        context = {
          params: { worldName: 'my world.dcl.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 400 status and an error message', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(400)
        expect(result.body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })

      it('should not get the world manifest', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).not.toHaveBeenCalled()
      })
    })

    describe('and the world name is empty', () => {
      beforeEach(() => {
        context = {
          params: { worldName: '' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 400 status and an error message', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(400)
        expect(result.body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })

      it('should not get the world manifest', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).not.toHaveBeenCalled()
      })
    })

    describe('and the world name has .dcl but not .eth', () => {
      beforeEach(() => {
        context = {
          params: { worldName: 'myworld.dcl' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 400 status and an error message', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(400)
        expect(result.body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })

      it('should not get the world manifest', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).not.toHaveBeenCalled()
      })
    })

    describe('and the world name is just .eth', () => {
      beforeEach(() => {
        context = {
          params: { worldName: '.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 400 status and an error message', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(400)
        expect(result.body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })

      it('should not get the world manifest', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).not.toHaveBeenCalled()
      })
    })

    describe('and the world name is just .dcl.eth', () => {
      beforeEach(() => {
        context = {
          params: { worldName: '.dcl.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 400 status and an error message', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(400)
        expect(result.body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })

      it('should not get the world manifest', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).not.toHaveBeenCalled()
      })
    })

    describe('and the world name has extra segments', () => {
      beforeEach(() => {
        context = {
          params: { worldName: 'myworld.extra.dcl.eth' },
          components: { coordinates }
        } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
      })

      it('should respond with a 400 status and an error message', async () => {
        const result = await getWorldManifestHandler(context)

        expect(result.status).toBe(400)
        expect(result.body).toEqual({
          ok: false,
          message: 'A valid world name is required'
        })
      })

      it('should not get the world manifest', async () => {
        await getWorldManifestHandler(context)

        expect(coordinates.getWorldManifest).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the coordinates component throws an error', () => {
    beforeEach(() => {
      coordinates.getWorldManifest.mockRejectedValue(new Error('Database connection failed'))

      context = {
        params: { worldName: 'myworld.dcl.eth' },
        components: { coordinates }
      } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
    })

    it('should respond with a 500 status, the error message and the json content type header', async () => {
      const result = await getWorldManifestHandler(context)

      expect(result.status).toBe(500)
      expect(result.body).toEqual({
        ok: false,
        message: 'Database connection failed'
      })
      expect(result.headers).toEqual({ 'Content-Type': 'application/json' })
    })
  })

  describe('and the coordinates component throws an error without a message', () => {
    beforeEach(() => {
      coordinates.getWorldManifest.mockRejectedValue({})

      context = {
        params: { worldName: 'myworld.dcl.eth' },
        components: { coordinates }
      } as unknown as HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
    })

    it('should respond with a 500 status, a generic error message and the json content type header', async () => {
      const result = await getWorldManifestHandler(context)

      expect(result.status).toBe(500)
      expect(result.body).toEqual({
        ok: false,
        message: 'Failed to get world manifest'
      })
      expect(result.headers).toEqual({ 'Content-Type': 'application/json' })
    })
  })
})
