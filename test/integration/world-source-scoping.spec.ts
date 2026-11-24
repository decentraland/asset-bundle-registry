import {
  Entity,
  EntityType,
  Events,
  WorldScenesUndeploymentEvent,
  WorldSpawnCoordinateSetEvent,
  WorldUndeploymentEvent
} from '@dcl/schemas'
import { AuthLinkType } from '@dcl/crypto'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { MessageAttributes, Registry } from '../../src/types'
import { getIdentity, Identity } from '../utils'
import { test } from '../components'

/**
 * A world name can be deployed on more than one worlds server. Removals must only touch the rows
 * of the server that sent them: the `sourceContentServerUrl` message attribute names it, and a
 * message without it comes from the default (prd) worlds server. Deploys rotate across servers
 * (last deploy wins).
 */
test('world removals scoped to their source server', async ({ components, spyComponents }) => {
  const DEFAULT_SERVER_URL = 'https://worlds-content-server.decentraland.org'
  const OTHER_SERVER_URL = 'https://worlds-content-server.dcl.dev'
  const WORLD_NAME = 'source-scoping.dcl.eth'
  let identity: Identity
  let defaultEntityId: string
  let otherEntityId: string

  const createDeploymentMessage = (entityId: string, contentServerUrl: string): DeploymentToSqs => ({
    entity: {
      entityId,
      authChain: [{ type: AuthLinkType.SIGNER, payload: identity.realAccount.address, signature: '' }]
    },
    contentServerUrls: [contentServerUrl]
  })

  const createWorldEntity = (id: string, parcel: string, timestamp: number): Entity => ({
    id,
    version: 'v3',
    type: EntityType.SCENE,
    pointers: [parcel],
    timestamp,
    content: [],
    metadata: { worldConfiguration: { name: WORLD_NAME }, scene: { base: parcel, parcels: [parcel] } }
  })

  const createWorldUndeploymentEvent = (): WorldUndeploymentEvent => ({
    type: Events.Type.WORLD,
    subType: Events.SubType.Worlds.WORLD_UNDEPLOYMENT,
    key: WORLD_NAME,
    timestamp: 3000,
    metadata: { worldName: WORLD_NAME }
  })

  const createSpawnCoordinateSetEvent = (): WorldSpawnCoordinateSetEvent => ({
    type: Events.Type.WORLD,
    subType: Events.SubType.Worlds.WORLD_SPAWN_COORDINATE_SET,
    key: WORLD_NAME,
    timestamp: 4000,
    metadata: { name: WORLD_NAME, oldCoordinate: null, newCoordinate: { x: 0, y: 0 } }
  })

  const completeBundles = async (entityId: string): Promise<void> => {
    for (const platform of ['windows', 'mac'] as const) {
      await components.registry.updateBundleAndRotateStates({
        bundleUpdate: { entityId, platform, isLods: false, status: Registry.SimplifiedStatus.COMPLETE }
      })
    }
  }

  const getStatus = async (entityId: string): Promise<Registry.Status | undefined> =>
    (await components.db.getRegistryById(entityId))?.status

  beforeAll(async () => {
    identity = await getIdentity()
  })

  beforeEach(() => {
    const suffix = Date.now()
    defaultEntityId = `source-default-${suffix}`
    otherEntityId = `source-other-${suffix}`
    spyComponents.worlds.isWorldDeployment.mockReturnValue(true)
  })

  afterEach(async () => {
    await components.db.deleteRegistries([defaultEntityId, otherEntityId])
    await components.extendedDb.deleteSpawnCoordinates([WORLD_NAME])
  })

  afterAll(async () => {
    await components.extendedDb.close()
  })

  describe('when both servers deployed scenes on different parcels', () => {
    beforeEach(async () => {
      spyComponents.worlds.getWorld
        .mockResolvedValueOnce(createWorldEntity(defaultEntityId, '0,0', 1000))
        .mockResolvedValueOnce(createWorldEntity(otherEntityId, '1,0', 2000))

      await components.messageProcessor.process(createDeploymentMessage(defaultEntityId, DEFAULT_SERVER_URL))
      await components.messageProcessor.process(createDeploymentMessage(otherEntityId, OTHER_SERVER_URL), {
        sourceContentServerUrl: OTHER_SERVER_URL
      })
    })

    it('should store the other server origin as the source of its row', async () => {
      expect(await components.extendedDb.getRegistrySourceContentServerUrl(otherEntityId)).toBe(OTHER_SERVER_URL)
    })

    it('should store no source for the default server row', async () => {
      expect(await components.extendedDb.getRegistrySourceContentServerUrl(defaultEntityId)).toBeNull()
    })

    describe('and a world undeployment arrives from the other server', () => {
      beforeEach(async () => {
        await components.messageProcessor.process(createWorldUndeploymentEvent(), {
          sourceContentServerUrl: OTHER_SERVER_URL
        })
      })

      it('should mark the other server rows as OBSOLETE', async () => {
        expect(await getStatus(otherEntityId)).toBe(Registry.Status.OBSOLETE)
      })

      it('should leave the default server rows untouched', async () => {
        expect(await getStatus(defaultEntityId)).toBe(Registry.Status.PENDING)
      })
    })

    describe('and a world undeployment arrives without a source attribute', () => {
      beforeEach(async () => {
        await components.messageProcessor.process(createWorldUndeploymentEvent())
      })

      it('should mark the default server rows as OBSOLETE', async () => {
        expect(await getStatus(defaultEntityId)).toBe(Registry.Status.OBSOLETE)
      })

      it('should leave the other server rows untouched', async () => {
        expect(await getStatus(otherEntityId)).toBe(Registry.Status.PENDING)
      })
    })

    describe('and a world undeployment names the default server origin as its source', () => {
      beforeEach(async () => {
        await components.messageProcessor.process(createWorldUndeploymentEvent(), {
          sourceContentServerUrl: `${DEFAULT_SERVER_URL}/`
        })
      })

      it('should mark the default server rows as OBSOLETE', async () => {
        expect(await getStatus(defaultEntityId)).toBe(Registry.Status.OBSOLETE)
      })

      it('should leave the other server rows untouched', async () => {
        expect(await getStatus(otherEntityId)).toBe(Registry.Status.PENDING)
      })
    })

    describe('and a world undeployment arrives with a source attribute that is not allowlisted', () => {
      let attributes: MessageAttributes

      beforeEach(async () => {
        attributes = { sourceContentServerUrl: 'https://worlds.not-allowed.example' }
        await components.messageProcessor.process(createWorldUndeploymentEvent(), attributes)
      })

      it('should leave the default server rows untouched', async () => {
        expect(await getStatus(defaultEntityId)).toBe(Registry.Status.PENDING)
      })

      it('should leave the other server rows untouched', async () => {
        expect(await getStatus(otherEntityId)).toBe(Registry.Status.PENDING)
      })
    })

    describe('and a world undeployment arrives with a source attribute that carries a path', () => {
      let attributes: MessageAttributes

      beforeEach(async () => {
        attributes = { sourceContentServerUrl: `${OTHER_SERVER_URL}/worlds-content-server` }
        await components.messageProcessor.process(createWorldUndeploymentEvent(), attributes)
      })

      it('should leave the other server rows untouched', async () => {
        expect(await getStatus(otherEntityId)).toBe(Registry.Status.PENDING)
      })
    })

    describe('and a world scenes undeployment from the other server names scenes of both servers', () => {
      beforeEach(async () => {
        const event: WorldScenesUndeploymentEvent = {
          type: Events.Type.WORLD,
          subType: Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT,
          key: WORLD_NAME,
          timestamp: 3000,
          metadata: {
            worldName: WORLD_NAME,
            scenes: [
              { entityId: defaultEntityId, baseParcel: '0,0' },
              { entityId: otherEntityId, baseParcel: '1,0' }
            ]
          }
        }
        await components.messageProcessor.process(event, { sourceContentServerUrl: OTHER_SERVER_URL })
      })

      it('should mark the other server scene as OBSOLETE', async () => {
        expect(await getStatus(otherEntityId)).toBe(Registry.Status.OBSOLETE)
      })

      it('should leave the default server scene untouched', async () => {
        expect(await getStatus(defaultEntityId)).toBe(Registry.Status.PENDING)
      })
    })
  })

  describe('when the other server deployed a scene that then got its bundles', () => {
    beforeEach(async () => {
      spyComponents.worlds.getWorld.mockResolvedValueOnce(createWorldEntity(otherEntityId, '1,0', 2000))
      await components.messageProcessor.process(createDeploymentMessage(otherEntityId, OTHER_SERVER_URL), {
        sourceContentServerUrl: OTHER_SERVER_URL
      })
      await completeBundles(otherEntityId)
    })

    it('should keep the other server as the row source', async () => {
      expect(await components.extendedDb.getRegistrySourceContentServerUrl(otherEntityId)).toBe(OTHER_SERVER_URL)
    })

    describe('and a world undeployment arrives from the default server', () => {
      beforeEach(async () => {
        await components.messageProcessor.process(createWorldUndeploymentEvent())
      })

      it('should leave the other server row COMPLETE', async () => {
        expect(await getStatus(otherEntityId)).toBe(Registry.Status.COMPLETE)
      })
    })
  })

  describe('when the default server scene is COMPLETE and the other server deploys on the same parcel', () => {
    beforeEach(async () => {
      spyComponents.worlds.getWorld
        .mockResolvedValueOnce(createWorldEntity(defaultEntityId, '0,0', 1000))
        .mockResolvedValueOnce(createWorldEntity(otherEntityId, '0,0', 2000))

      await components.messageProcessor.process(createDeploymentMessage(defaultEntityId, DEFAULT_SERVER_URL))
      await completeBundles(defaultEntityId)
      await components.messageProcessor.process(createDeploymentMessage(otherEntityId, OTHER_SERVER_URL), {
        sourceContentServerUrl: OTHER_SERVER_URL
      })
    })

    it('should keep serving the default server scene as FALLBACK', async () => {
      expect(await getStatus(defaultEntityId)).toBe(Registry.Status.FALLBACK)
    })

    describe('and the other server undeploys the world before its scene completes', () => {
      beforeEach(async () => {
        await components.messageProcessor.process(createWorldUndeploymentEvent(), {
          sourceContentServerUrl: OTHER_SERVER_URL
        })
      })

      it('should mark the other server scene as OBSOLETE', async () => {
        expect(await getStatus(otherEntityId)).toBe(Registry.Status.OBSOLETE)
      })

      it('should leave the default server scene as FALLBACK', async () => {
        expect(await getStatus(defaultEntityId)).toBe(Registry.Status.FALLBACK)
      })
    })

    describe('and the other server scene completes', () => {
      beforeEach(async () => {
        await completeBundles(otherEntityId)
      })

      it('should rotate the default server scene to OBSOLETE', async () => {
        expect(await getStatus(defaultEntityId)).toBe(Registry.Status.OBSOLETE)
      })

      describe('and the other server then undeploys the world', () => {
        beforeEach(async () => {
          await components.messageProcessor.process(createWorldUndeploymentEvent(), {
            sourceContentServerUrl: OTHER_SERVER_URL
          })
        })

        it('should mark the other server scene as OBSOLETE', async () => {
          expect(await getStatus(otherEntityId)).toBe(Registry.Status.OBSOLETE)
        })

        it('should leave the default server scene OBSOLETE until the default server redeploys', async () => {
          expect(await getStatus(defaultEntityId)).toBe(Registry.Status.OBSOLETE)
        })
      })
    })
  })

  describe('when only the default server serves the world', () => {
    beforeEach(async () => {
      spyComponents.worlds.getWorld.mockResolvedValueOnce(createWorldEntity(defaultEntityId, '0,0', 1000))
      await components.messageProcessor.process(createDeploymentMessage(defaultEntityId, DEFAULT_SERVER_URL))
    })

    describe('and the other server sets the spawn coordinate', () => {
      beforeEach(async () => {
        await components.messageProcessor.process(createSpawnCoordinateSetEvent(), {
          sourceContentServerUrl: OTHER_SERVER_URL
        })
      })

      it('should not store the spawn coordinate', async () => {
        expect(await components.extendedDb.getSpawnCoordinateByWorldName(WORLD_NAME)).toBeNull()
      })
    })

    describe('and the default server sets the spawn coordinate', () => {
      beforeEach(async () => {
        await components.messageProcessor.process(createSpawnCoordinateSetEvent())
      })

      it('should store the spawn coordinate as user set', async () => {
        expect(await components.extendedDb.getSpawnCoordinateByWorldName(WORLD_NAME)).toEqual(
          expect.objectContaining({ x: 0, y: 0, isUserSet: true })
        )
      })
    })
  })
})
