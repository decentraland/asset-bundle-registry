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
  const otherPointer = '0x2222222222222222222222222222222222222222'
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

    describe('and the requested pointer is checksummed', () => {
      beforeEach(() => {
        getAvatarsDetailsByPost.mockResolvedValue([createLambdasProfile(requestedPointer.toUpperCase())])
      })

      it('should key it by the lowercased pointer', async () => {
        const result = await component.getProfiles([requestedPointer.toUpperCase()])

        expect(result.get(requestedPointer)).toBeDefined()
      })
    })

    describe('and a name pointer is requested', () => {
      const namePointer = 'default5'

      beforeEach(() => {
        // A default profile carries the deployer address, unrelated to the requested name
        getAvatarsDetailsByPost.mockResolvedValue([createLambdasProfile(otherPointer)])
      })

      it('should key the profile by the requested name pointer', async () => {
        const result = await component.getProfiles([namePointer])

        expect(result.get(namePointer)).toBeDefined()
      })

      it('should not key it by the address in its metadata', async () => {
        const result = await component.getProfiles([namePointer])

        expect(result.has(otherPointer)).toBe(false)
      })

      it('should request it on its own so it can be correlated', async () => {
        await component.getProfiles([namePointer, requestedPointer])

        expect(getAvatarsDetailsByPost).toHaveBeenCalledWith({ ids: [namePointer] })
        expect(getAvatarsDetailsByPost).toHaveBeenCalledWith({ ids: [requestedPointer] })
      })
    })

    describe('and pointers are neither an address nor a default profile name', () => {
      beforeEach(() => {
        getAvatarsDetailsByPost.mockResolvedValue([])
      })

      it('should not request them at all', async () => {
        await component.getProfiles([
          'not-a-pointer',
          'another-one',
          '',
          'default',
          'defaultfoo',
          'default-1',
          'default_1'
        ])

        expect(getAvatarsDetailsByPost).not.toHaveBeenCalled()
      })
    })

    describe('and several name pointers are requested', () => {
      const namePointers = Array.from({ length: 12 }, (_, index) => `default${index}`)

      beforeEach(() => {
        getAvatarsDetailsByPost.mockResolvedValue([])
      })

      it('should look every one of them up rather than truncate', async () => {
        await component.getProfiles(namePointers)

        expect(getAvatarsDetailsByPost).toHaveBeenCalledTimes(namePointers.length)
      })
    })

    describe('and a name pointer request returns more than one profile', () => {
      beforeEach(() => {
        getAvatarsDetailsByPost.mockResolvedValue([
          createLambdasProfile(otherPointer),
          createLambdasProfile(requestedPointer)
        ])
      })

      it('should drop it rather than guess which one was meant', async () => {
        const result = await component.getProfiles(['default5'])

        expect(result.size).toEqual(0)
      })
    })
  })

  describe('when converting a lambdas profile to an entity', () => {
    it('should point the entity at the supplied pointer', () => {
      const entity = component.convertLambdasProfileToEntity(createLambdasProfile(requestedPointer), requestedPointer)

      expect(entity?.pointers).toEqual([requestedPointer])
    })
  })
})
