import { Profile } from 'dcl-catalyst-client/dist/client/specs/lambdas-client'
import { createCatalystAdapter } from '../../../src/adapters/catalyst'
import { ICatalystComponent } from '../../../src/types'
import { createConfigMockComponent } from '../mocks/config'
import { createLogMockComponent } from '../mocks/logs'

const getAvatarsDetailsByPost = jest.fn()

jest.mock('dcl-catalyst-client', () => ({
  createContentClient: jest.fn().mockReturnValue({}),
  createLambdasClient: jest.fn().mockImplementation(() => ({ getAvatarsDetailsByPost }))
}))

function createLambdasProfile(address: string, timestamp = 1000): Profile {
  return {
    timestamp,
    avatars: [
      {
        name: 'test',
        hasClaimedName: false,
        ethAddress: address,
        userId: address,
        avatar: {
          snapshots: {
            body: `https://peer.decentraland.org/content/entities/bafkrei${address.slice(-4)}/body.png`,
            face256: `https://peer.decentraland.org/content/entities/bafkrei${address.slice(-4)}/face.png`
          }
        }
      }
    ]
  } as unknown as Profile
}

describe('catalyst adapter', () => {
  const requestedPointer = '0x1111111111111111111111111111111111111111'
  let component: ICatalystComponent

  beforeEach(async () => {
    const config = createConfigMockComponent()
    ;(config.requireString as jest.Mock).mockResolvedValue('https://peer.decentraland.org')
    getAvatarsDetailsByPost.mockReset()

    component = await createCatalystAdapter({
      config,
      logs: createLogMockComponent() as any,
      fetch: { fetch: jest.fn() } as any
    })
  })

  describe('when fetching profiles', () => {
    describe('and a returned profile matches the requested address', () => {
      beforeEach(() => {
        getAvatarsDetailsByPost.mockResolvedValue([createLambdasProfile(requestedPointer)])
      })

      it('should key it by the requested pointer', async () => {
        const result = await component.getProfiles([requestedPointer])

        expect(result.get(requestedPointer)).toBeDefined()
      })
    })

    describe('and a default profile name is requested', () => {
      beforeEach(() => {
        // A default profile reports the deployer address, not the name it was asked for
        getAvatarsDetailsByPost.mockResolvedValue([createLambdasProfile('0x1337000000000000000000000000000000001337')])
      })

      it('should not look it up, since the response could not be attributed to it', async () => {
        await component.getProfiles(['default5'])

        expect(getAvatarsDetailsByPost).not.toHaveBeenCalled()
      })

      it('should not return a profile under the address it would have reported', async () => {
        const result = await component.getProfiles(['default5'])

        expect(result.size).toEqual(0)
      })

      it('should still look up the address pointers requested alongside it', async () => {
        await component.getProfiles(['default5', requestedPointer])

        expect(getAvatarsDetailsByPost).toHaveBeenCalledWith({ ids: [requestedPointer] })
      })
    })

    describe('and the requested pointer is checksummed', () => {
      beforeEach(() => {
        getAvatarsDetailsByPost.mockResolvedValue([createLambdasProfile(requestedPointer.toUpperCase())])
      })

      it('should key it by the lowercased pointer', async () => {
        const result = await component.getProfiles([requestedPointer.toUpperCase()])

        expect(result.get(requestedPointer)).toBeDefined()
      })
    })
  })

  describe('when converting a lambdas profile to an entity', () => {
    it('should point the entity at the address it reports', () => {
      const entity = component.convertLambdasProfileToEntity(createLambdasProfile(requestedPointer))

      expect(entity?.pointers).toEqual([requestedPointer])
    })
  })
})
