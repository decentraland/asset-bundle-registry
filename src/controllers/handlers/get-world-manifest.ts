import { InvalidRequestError } from '@dcl/http-commons'
import { HandlerContextWithPath } from '../../types'
import { isWorldNameValid } from '../schemas/worlds'

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

  try {
    if (!isWorldNameValid(worldName)) {
      throw new InvalidRequestError('A valid world name is required')
    }

    const manifest = await coordinates.getWorldManifest(worldName)

    return {
      status: 200,
      body: manifest,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  } catch (error: any) {
    if (error instanceof InvalidRequestError) {
      return {
        status: 400,
        body: {
          ok: false,
          message: error.message
        }
      }
    }

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
