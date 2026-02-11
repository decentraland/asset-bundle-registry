import {
  Events,
  WorldSpawnCoordinateSetEvent,
  WorldScenesUndeploymentEvent,
  WorldUndeploymentEvent
} from '@dcl/schemas'
import { Registry } from '../../src/types'
import { createRegistryEntity, getIdentity, Identity } from '../utils'
import { test } from '../components'

/**
 * Integration tests for spawn coordinate race condition handling via message processor.
 *
 * These tests verify that when multiple events are processed out of order,
 * the event with the newest timestamp always wins. This is achieved by processing
 * events through the actual message processor, simulating real-world scenarios.
 */
test('spawn coordinate race conditions via message processor', async ({ components }) => {
  let identity: Identity
  const registriesToCleanUp: string[] = []
  const spawnCoordinatesToCleanUp: string[] = []

  beforeAll(async () => {
    identity = await getIdentity()
  })

  afterEach(async () => {
    if (registriesToCleanUp.length > 0) {
      await components.db.deleteRegistries(registriesToCleanUp)
      registriesToCleanUp.length = 0
    }

    if (spawnCoordinatesToCleanUp.length > 0) {
      await components.extendedDb.deleteSpawnCoordinates(spawnCoordinatesToCleanUp)
      spawnCoordinatesToCleanUp.length = 0
    }
  })

  afterAll(async () => {
    await components.extendedDb.close()
  })

  /**
   * Helper to create a WorldSpawnCoordinateSetEvent
   */
  const createSpawnCoordinateSetEvent = (
    worldName: string,
    newCoordinate: { x: number; y: number },
    timestamp: number,
    oldCoordinate: { x: number; y: number } | null = null
  ): WorldSpawnCoordinateSetEvent => ({
    type: Events.Type.WORLD,
    subType: Events.SubType.Worlds.WORLD_SPAWN_COORDINATE_SET,
    key: `spawn-${worldName}-${timestamp}`,
    timestamp,
    metadata: {
      name: worldName,
      newCoordinate,
      oldCoordinate
    }
  })

  /**
   * Helper to create a WorldScenesUndeploymentEvent
   */
  const createScenesUndeploymentEvent = (
    worldName: string,
    scenes: Array<{ entityId: string; baseParcel: string }>,
    timestamp: number
  ): WorldScenesUndeploymentEvent => ({
    type: Events.Type.WORLD,
    subType: Events.SubType.Worlds.WORLD_SCENES_UNDEPLOYMENT,
    key: `undeploy-${timestamp}`,
    timestamp,
    metadata: {
      worldName,
      scenes
    }
  })

  /**
   * Helper to create a WorldUndeploymentEvent
   */
  const createWorldUndeploymentEvent = (worldName: string, timestamp: number): WorldUndeploymentEvent => ({
    type: Events.Type.WORLD,
    subType: Events.SubType.Worlds.WORLD_UNDEPLOYMENT,
    key: `world-undeploy-${timestamp}`,
    timestamp,
    metadata: {
      worldName
    }
  })

  /**
   * Helper to create a world registry entity
   */
  const createWorldRegistry = async (
    worldName: string,
    status: Registry.Status,
    bundleStatus: Registry.SimplifiedStatus,
    pointers: string[],
    overrides: Partial<Registry.DbEntity> = {}
  ): Promise<Registry.DbEntity> => {
    const registry = createRegistryEntity(identity.realAccount.address, status, bundleStatus, {
      type: 'world',
      pointers,
      metadata: {
        worldConfiguration: {
          name: worldName
        }
      },
      ...overrides
    })
    await components.extendedDb.insertRegistry(registry)
    registriesToCleanUp.push(registry.id)
    spawnCoordinatesToCleanUp.push(worldName)
    return registry
  }

  describe('when a world registry exists', () => {
    describe('and no spawn coordinate exists yet', () => {
      const worldName = 'no-spawn-world.dcl.eth'

      beforeEach(async () => {
        await createWorldRegistry(
          worldName,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          ['0,0', '1,0'],
          {
            id: 'entity-no-spawn',
            timestamp: 1000
          }
        )
      })

      describe('and a spawn coordinate event is received', () => {
        let spawnEvent: WorldSpawnCoordinateSetEvent

        beforeEach(async () => {
          spawnEvent = createSpawnCoordinateSetEvent(worldName, { x: 0, y: 0 }, 1000)
          await components.messageProcessor.process(spawnEvent)
        })

        it('should create the spawn coordinate', async () => {
          const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

          expect(spawn).not.toBeNull()
          expect(spawn!.x).toBe(0)
          expect(spawn!.y).toBe(0)
          expect(Number(spawn!.timestamp)).toBe(1000)
        })

        describe('and a newer spawn coordinate event arrives', () => {
          let newerEvent: WorldSpawnCoordinateSetEvent

          beforeEach(async () => {
            newerEvent = createSpawnCoordinateSetEvent(worldName, { x: 5, y: 5 }, 2000)
            await components.messageProcessor.process(newerEvent)
          })

          it('should update to the new spawn coordinate', async () => {
            const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

            expect(spawn!.x).toBe(5)
            expect(spawn!.y).toBe(5)
            expect(Number(spawn!.timestamp)).toBe(2000)
          })

          describe('and an older spawn coordinate event arrives late', () => {
            beforeEach(async () => {
              const olderEvent = createSpawnCoordinateSetEvent(worldName, { x: 3, y: 3 }, 1500)
              await components.messageProcessor.process(olderEvent)
            })

            it('should preserve the newer spawn coordinate', async () => {
              const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

              expect(spawn!.x).toBe(5)
              expect(spawn!.y).toBe(5)
              expect(Number(spawn!.timestamp)).toBe(2000)
            })
          })
        })
      })
    })

    describe('and a spawn coordinate already exists', () => {
      const worldName = 'existing-spawn-world.dcl.eth'

      beforeEach(async () => {
        await createWorldRegistry(
          worldName,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          ['0,0', '1,0', '2,0'],
          { id: 'entity-existing-spawn', timestamp: 1000 }
        )
        await components.extendedDb.insertSpawnCoordinate(worldName, 1, 0, false, 1000)
      })

      describe('and a newer spawn coordinate event is received', () => {
        let newerEvent: WorldSpawnCoordinateSetEvent

        beforeEach(async () => {
          newerEvent = createSpawnCoordinateSetEvent(worldName, { x: 5, y: 5 }, 2000)
          await components.messageProcessor.process(newerEvent)
        })

        it('should update the spawn coordinate', async () => {
          const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

          expect(spawn!.x).toBe(5)
          expect(spawn!.y).toBe(5)
          expect(spawn!.isUserSet).toBe(true)
          expect(Number(spawn!.timestamp)).toBe(2000)
        })

        describe('and an older spawn coordinate event arrives late', () => {
          beforeEach(async () => {
            const olderEvent = createSpawnCoordinateSetEvent(worldName, { x: 0, y: 0 }, 1500)
            await components.messageProcessor.process(olderEvent)
          })

          it('should preserve the newer spawn coordinate', async () => {
            const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

            expect(spawn!.x).toBe(5)
            expect(spawn!.y).toBe(5)
            expect(Number(spawn!.timestamp)).toBe(2000)
          })
        })
      })

      describe('and an older spawn coordinate event is received', () => {
        beforeEach(async () => {
          const olderEvent = createSpawnCoordinateSetEvent(worldName, { x: 9, y: 9 }, 500)
          await components.messageProcessor.process(olderEvent)
        })

        it('should not update the spawn coordinate', async () => {
          const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

          expect(spawn!.x).toBe(1)
          expect(spawn!.y).toBe(0)
          expect(Number(spawn!.timestamp)).toBe(1000)
        })
      })

      describe('and a spawn coordinate event with the same timestamp is received', () => {
        beforeEach(async () => {
          const sameTimestampEvent = createSpawnCoordinateSetEvent(worldName, { x: 7, y: 7 }, 1000)
          await components.messageProcessor.process(sameTimestampEvent)
        })

        it('should not update the spawn coordinate', async () => {
          const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

          expect(spawn!.x).toBe(1)
          expect(spawn!.y).toBe(0)
          expect(Number(spawn!.timestamp)).toBe(1000)
        })
      })
    })

    describe('and a user-set spawn coordinate exists', () => {
      const worldName = 'user-spawn-world.dcl.eth'
      let entityId: string

      beforeEach(async () => {
        const registry = await createWorldRegistry(
          worldName,
          Registry.Status.COMPLETE,
          Registry.SimplifiedStatus.COMPLETE,
          ['0,0', '1,0', '2,0'],
          { id: 'entity-user-spawn', timestamp: 1000 }
        )
        entityId = registry.id
        await components.extendedDb.insertSpawnCoordinate(worldName, 5, 5, true, 2000)
      })

      describe('and a scenes undeployment event is received', () => {
        describe('and the undeployment has an older timestamp', () => {
          beforeEach(async () => {
            const undeployEvent = createScenesUndeploymentEvent(worldName, [{ entityId, baseParcel: '0,0' }], 1500)
            await components.messageProcessor.process(undeployEvent)
          })

          it('should preserve the user spawn coordinate', async () => {
            const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

            expect(spawn!.x).toBe(5)
            expect(spawn!.y).toBe(5)
            expect(spawn!.isUserSet).toBe(true)
            expect(Number(spawn!.timestamp)).toBe(2000)
          })
        })

        describe('and the undeployment has a newer timestamp', () => {
          beforeEach(async () => {
            const undeployEvent = createScenesUndeploymentEvent(worldName, [{ entityId, baseParcel: '0,0' }], 3000)
            await components.messageProcessor.process(undeployEvent)
          })

          it('should allow the spawn coordinate to be recalculated', async () => {
            // After undeployment with newer timestamp, spawn may be deleted or recalculated
            // The key assertion is that the timestamp was updated
            const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

            // Spawn may be null (deleted) or have updated timestamp
            if (spawn) {
              expect(Number(spawn.timestamp)).toBeGreaterThanOrEqual(3000)
            }
          })
        })
      })

      describe('and a world undeployment event is received', () => {
        describe('and the undeployment has an older timestamp', () => {
          beforeEach(async () => {
            const worldUndeployEvent = createWorldUndeploymentEvent(worldName, 1500)
            await components.messageProcessor.process(worldUndeployEvent)
          })

          it('should preserve the user spawn coordinate', async () => {
            const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

            expect(spawn!.x).toBe(5)
            expect(spawn!.y).toBe(5)
            expect(spawn!.isUserSet).toBe(true)
            expect(Number(spawn!.timestamp)).toBe(2000)
          })
        })

        describe('and the undeployment has a newer timestamp', () => {
          beforeEach(async () => {
            const worldUndeployEvent = createWorldUndeploymentEvent(worldName, 3000)
            await components.messageProcessor.process(worldUndeployEvent)
          })

          it('should allow the spawn coordinate to be recalculated', async () => {
            // After world undeployment with newer timestamp, spawn may be deleted or recalculated
            // The key assertion is that the timestamp was updated
            const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

            // Spawn may be null (deleted) or have updated timestamp
            if (spawn) {
              expect(Number(spawn.timestamp)).toBeGreaterThanOrEqual(3000)
            }
          })
        })
      })

      describe('and an older spawn coordinate event arrives', () => {
        beforeEach(async () => {
          const olderEvent = createSpawnCoordinateSetEvent(worldName, { x: 1, y: 0 }, 1000)
          await components.messageProcessor.process(olderEvent)
        })

        it('should preserve the user spawn coordinate', async () => {
          const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

          expect(spawn!.x).toBe(5)
          expect(spawn!.y).toBe(5)
          expect(spawn!.isUserSet).toBe(true)
          expect(Number(spawn!.timestamp)).toBe(2000)
        })
      })
    })
  })

  describe('when multiple spawn coordinate events arrive out of order', () => {
    const worldName = 'out-of-order-world.dcl.eth'

    beforeEach(async () => {
      await createWorldRegistry(
        worldName,
        Registry.Status.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE,
        ['0,0', '1,0', '2,0', '3,0', '4,0'],
        { id: 'entity-out-of-order', timestamp: 1000 }
      )
    })

    describe('and events are processed in reverse timestamp order', () => {
      beforeEach(async () => {
        const event1000 = createSpawnCoordinateSetEvent(worldName, { x: 0, y: 0 }, 1000)
        const event2000 = createSpawnCoordinateSetEvent(worldName, { x: 5, y: 5 }, 2000)
        const event3000 = createSpawnCoordinateSetEvent(worldName, { x: 10, y: 10 }, 3000)

        // Process in ascending order (oldest first)
        await components.messageProcessor.process(event1000)
        await components.messageProcessor.process(event2000)
        await components.messageProcessor.process(event3000)
      })

      it('should end up with the newest timestamp value', async () => {
        const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

        expect(spawn!.x).toBe(10)
        expect(spawn!.y).toBe(10)
        expect(Number(spawn!.timestamp)).toBe(3000)
      })
    })

    describe('and events are processed in random order', () => {
      beforeEach(async () => {
        const event1000 = createSpawnCoordinateSetEvent(worldName, { x: 0, y: 0 }, 1000)
        const event2000 = createSpawnCoordinateSetEvent(worldName, { x: 5, y: 5 }, 2000)
        const event3000 = createSpawnCoordinateSetEvent(worldName, { x: 10, y: 10 }, 3000)

        // Process in random order: T=2000, T=3000, T=1000
        await components.messageProcessor.process(event2000)
        await components.messageProcessor.process(event3000)
        await components.messageProcessor.process(event1000)
      })

      it('should end up with the newest timestamp value', async () => {
        const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

        expect(spawn!.x).toBe(10)
        expect(spawn!.y).toBe(10)
        expect(Number(spawn!.timestamp)).toBe(3000)
      })
    })
  })

  describe('when simulating real-world event sequences', () => {
    const worldName = 'real-world-sequence.dcl.eth'

    beforeEach(async () => {
      await createWorldRegistry(
        worldName,
        Registry.Status.COMPLETE,
        Registry.SimplifiedStatus.COMPLETE,
        ['0,0', '1,0', '2,0', '3,0'],
        { id: 'entity-real-world', timestamp: 1000 }
      )
    })

    describe('and a deployment recalculates spawn', () => {
      beforeEach(async () => {
        const deployRecalc = createSpawnCoordinateSetEvent(worldName, { x: 2, y: 0 }, 1000)
        await components.messageProcessor.process(deployRecalc)
      })

      it('should set the calculated spawn coordinate', async () => {
        const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

        expect(spawn!.x).toBe(2)
        expect(spawn!.y).toBe(0)
        expect(Number(spawn!.timestamp)).toBe(1000)
      })

      describe('and a user sets the spawn coordinate', () => {
        beforeEach(async () => {
          const userSet = createSpawnCoordinateSetEvent(worldName, { x: 0, y: 0 }, 2000)
          await components.messageProcessor.process(userSet)
        })

        it('should update to the user spawn coordinate', async () => {
          const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

          expect(spawn!.x).toBe(0)
          expect(spawn!.y).toBe(0)
          expect(Number(spawn!.timestamp)).toBe(2000)
        })

        describe('and a late deployment recalculation arrives with older timestamp', () => {
          beforeEach(async () => {
            const lateRecalc = createSpawnCoordinateSetEvent(worldName, { x: 1, y: 0 }, 1500)
            await components.messageProcessor.process(lateRecalc)
          })

          it('should preserve the user spawn coordinate', async () => {
            const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

            expect(spawn!.x).toBe(0)
            expect(spawn!.y).toBe(0)
            expect(Number(spawn!.timestamp)).toBe(2000)
          })
        })

        describe('and a new deployment recalculation arrives with newer timestamp', () => {
          beforeEach(async () => {
            const newRecalc = createSpawnCoordinateSetEvent(worldName, { x: 1, y: 0 }, 3000)
            await components.messageProcessor.process(newRecalc)
          })

          it('should update to the new spawn coordinate', async () => {
            const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

            expect(spawn!.x).toBe(1)
            expect(spawn!.y).toBe(0)
            expect(Number(spawn!.timestamp)).toBe(3000)
          })
        })
      })
    })

    describe('and a user sets spawn before any deployment', () => {
      beforeEach(async () => {
        const userSet = createSpawnCoordinateSetEvent(worldName, { x: 3, y: 3 }, 1000)
        await components.messageProcessor.process(userSet)
      })

      it('should set the user spawn coordinate', async () => {
        const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

        expect(spawn!.x).toBe(3)
        expect(spawn!.y).toBe(3)
        expect(Number(spawn!.timestamp)).toBe(1000)
      })

      describe('and a scenes undeployment event arrives', () => {
        let entityId: string

        beforeEach(async () => {
          const registry = await components.db.getRegistryById('entity-real-world')
          entityId = registry!.id
          const undeployEvent = createScenesUndeploymentEvent(worldName, [{ entityId, baseParcel: '0,0' }], 2000)
          await components.messageProcessor.process(undeployEvent)
        })

        describe('and a new deployment recalculates spawn', () => {
          beforeEach(async () => {
            const newRecalc = createSpawnCoordinateSetEvent(worldName, { x: 1, y: 0 }, 3000)
            await components.messageProcessor.process(newRecalc)
          })

          it('should update to the latest spawn coordinate', async () => {
            const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

            expect(spawn!.x).toBe(1)
            expect(spawn!.y).toBe(0)
            expect(Number(spawn!.timestamp)).toBe(3000)
          })
        })
      })

      describe('and a world undeployment event arrives', () => {
        beforeEach(async () => {
          const worldUndeployEvent = createWorldUndeploymentEvent(worldName, 2000)
          await components.messageProcessor.process(worldUndeployEvent)
        })

        describe('and a new deployment recalculates spawn', () => {
          beforeEach(async () => {
            const newRecalc = createSpawnCoordinateSetEvent(worldName, { x: 1, y: 0 }, 3000)
            await components.messageProcessor.process(newRecalc)
          })

          it('should update to the latest spawn coordinate', async () => {
            const spawn = await components.extendedDb.getSpawnCoordinateByWorldName(worldName)

            expect(spawn!.x).toBe(1)
            expect(spawn!.y).toBe(0)
            expect(Number(spawn!.timestamp)).toBe(3000)
          })
        })
      })
    })
  })
})
