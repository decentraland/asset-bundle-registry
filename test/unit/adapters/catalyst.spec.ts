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
      const deployerAddress = '0x1337000000000000000000000000000000001337'

      beforeEach(() => {
        // A default profile reports the deployer address, not the name it was asked for
        getAvatarsDetailsByPost.mockResolvedValue([createLambdasProfile(deployerAddress)])
      })

      it('should key it by the name it was asked for', async () => {
        const result = await component.getProfiles(['default5'])

        expect(result.get('default5')).toBeDefined()
      })

      it('should not key it by the deployer address it reports', async () => {
        const result = await component.getProfiles(['default5'])

        expect(result.has(deployerAddress)).toBe(false)
      })

      it('should ask for it on its own, which is what attributes the answer to the name', async () => {
        await component.getProfiles(['default5', requestedPointer])

        expect(getAvatarsDetailsByPost).toHaveBeenCalledWith({ ids: ['default5'] })
        expect(getAvatarsDetailsByPost).toHaveBeenCalledWith({ ids: [requestedPointer] })
      })

      it('should look every requested name up rather than truncate', async () => {
        const names = Array.from({ length: 12 }, (_, index) => `default${index}`)

        await component.getProfiles(names)

        expect(getAvatarsDetailsByPost).toHaveBeenCalledTimes(names.length)
      })
    })

    describe('and a name pointer answer holds more than one profile', () => {
      beforeEach(() => {
        getAvatarsDetailsByPost.mockResolvedValue([
          createLambdasProfile('0x1337000000000000000000000000000000001337'),
          createLambdasProfile(requestedPointer)
        ])
      })

      it('should drop it rather than guess which name it belongs to', async () => {
        const result = await component.getProfiles(['default5'])

        expect(result.size).toEqual(0)
      })
    })

    describe('and an id is neither an address nor a default profile name', () => {
      beforeEach(() => {
        getAvatarsDetailsByPost.mockResolvedValue([])
      })

      it('should not look it up at all', async () => {
        await component.getProfiles(['not-a-pointer'])

        expect(getAvatarsDetailsByPost).not.toHaveBeenCalled()
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
    describe('and the metadata carries an identity other than the address it reports', () => {
      let profile: Profile

      beforeEach(() => {
        profile = createLambdasProfile(requestedPointer)
        // an older node serves the deployed metadata, where the two can disagree
        ;(profile.avatars as any)[0].userId = '0x9999999999999999999999999999999999999999'
      })

      it('should settle the userId to the pointer the entity is keyed by', () => {
        const entity = component.convertLambdasProfileToEntity(profile, requestedPointer)

        expect((entity?.metadata as Profile).avatars?.[0].userId).toEqual(requestedPointer)
      })
    })

    describe('and the reported address is checksummed', () => {
      let entity: ReturnType<ICatalystComponent['convertLambdasProfileToEntity']>

      beforeEach(() => {
        entity = component.convertLambdasProfileToEntity(
          createLambdasProfile(requestedPointer.toUpperCase()),
          requestedPointer.toUpperCase()
        )
      })

      it('should key the entity by the lowercased pointer', () => {
        expect(entity?.pointers).toEqual([requestedPointer])
      })

      it('should settle the identity to the same lowercased value', () => {
        const avatar = (entity?.metadata as Profile).avatars?.[0]

        expect([avatar?.ethAddress, avatar?.userId]).toEqual([requestedPointer, requestedPointer])
      })
    })

    describe('and the pointer is a default profile name', () => {
      const deployerAddress = '0x1337000000000000000000000000000000001337'

      it('should key the entity by the name', () => {
        const entity = component.convertLambdasProfileToEntity(createLambdasProfile(deployerAddress), 'default5')

        expect(entity?.pointers).toEqual(['default5'])
      })

      it('should leave the deployed identity alone, since the pointer is not an address', () => {
        const entity = component.convertLambdasProfileToEntity(createLambdasProfile(deployerAddress), 'default5')

        expect((entity?.metadata as Profile).avatars?.[0].ethAddress).toEqual(deployerAddress)
      })
    })

    it('should point the entity at the address it reports', () => {
      const entity = component.convertLambdasProfileToEntity(createLambdasProfile(requestedPointer), requestedPointer)

      expect(entity?.pointers).toEqual([requestedPointer])
    })
  })
})
