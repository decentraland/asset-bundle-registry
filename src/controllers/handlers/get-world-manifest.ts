import { HandlerContextWithPath } from '../../types'

/**
 * Handler for GET /worlds/:worldName/manifest
 *
 * Returns the world manifest including:
 * - occupied: Array of parcel strings in "x,y" format
 * - spawn_coordinate: The spawn coordinate { x: string, y: string }
 * - total: Total number of occupied parcels
 */
export async function getWorldManifestHandler(
  context: HandlerContextWithPath<'coordinates', '/worlds/:worldName/manifest'>
) {
  const {
    params,
    components: { coordinates }
  } = context

  const worldName = params.worldName

  if (!worldName) {
    return {
      status: 400,
      body: {
        ok: false,
        message: 'World name is required'
      },
      headers: {
        'Content-Type': 'application/json'
      }
    }
  }

  try {
    const manifest = await coordinates.getWorldManifest(worldName)

    return {
      status: 200,
      body: manifest,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  } catch (error: any) {
    return {
      status: 500,
      body: {
        ok: false,
        message: error?.message || 'Failed to get world manifest'
      },
      headers: {
        'Content-Type': 'application/json'
      }
    }
  }
}
