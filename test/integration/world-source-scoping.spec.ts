import { Entity, EntityType, Events, WorldScenesUndeploymentEvent, WorldUndeploymentEvent } from '@dcl/schemas'
import { AuthLinkType } from '@dcl/crypto'
import { DeploymentToSqs } from '@dcl/schemas/dist/misc/deployments-to-sqs'
import { MessageAttributes, Registry } from '../../src/types'
import { getIdentity, Identity } from '../utils'
import { test } from '../components'

/**
 * A world name can be deployed on more than one worlds server. Removals must only touch the rows
 * of the server that sent them: the `sourceContentServerUrl` message attribute names it, and a
 * message without it comes from the default (prd) worlds server.
 */
test('world removals scoped to their source server', async ({ components, spyComponents }) => {
  const OTHER_SERVER_URL = 'https://worlds-content-server.decentraland.zone'
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

  const getStatus = async (entityId: string): Promise<Registry.Status | undefined> =>
    (await components.db.getRegistryById(entityId))?.status

  beforeAll(async () => {
    identity = await getIdentity()
  })

  beforeEach(async () => {
    const suffix = Date.now()
    defaultEntityId = `source-default-${suffix}`
    otherEntityId = `source-other-${suffix}`
    spyComponents.worlds.isWorldDeployment.mockReturnValue(true)
    spyComponents.worlds.getWorld
      .mockResolvedValueOnce(createWorldEntity(defaultEntityId, '0,0', 1000))
      .mockResolvedValueOnce(createWorldEntity(otherEntityId, '1,0', 2000))

    await components.messageProcessor.process(
      createDeploymentMessage(defaultEntityId, 'https://worlds-content-server.decentraland.org')
    )
    await components.messageProcessor.process(createDeploymentMessage(otherEntityId, OTHER_SERVER_URL), {
      sourceContentServerUrl: OTHER_SERVER_URL
    })
  })

  afterEach(async () => {
    await components.db.deleteRegistries([defaultEntityId, otherEntityId])
    await components.extendedDb.deleteSpawnCoordinates([WORLD_NAME])
  })

  afterAll(async () => {
    await components.extendedDb.close()
  })

  describe('when a world undeployment arrives from the other server', () => {
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

  describe('when a world undeployment arrives without a source attribute', () => {
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

  describe('when a world undeployment arrives with a source attribute that is not allowlisted', () => {
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

  describe('when a world scenes undeployment from the other server names scenes of both servers', () => {
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
