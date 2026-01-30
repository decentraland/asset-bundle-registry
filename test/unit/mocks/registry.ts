import { IRegistryComponent } from '../../../src/logic/registry'
import { Registry, UndeploymentResult } from '../../../src/types'

export function createRegistryMockComponent(): jest.Mocked<IRegistryComponent> {
  return {
    persistAndRotateStates: jest.fn().mockResolvedValue({
      id: 'mock-entity-id',
      type: 'scene',
      timestamp: Date.now(),
      deployer: '0x123',
      pointers: ['0,0'],
      content: [],
      metadata: {},
      status: Registry.Status.PENDING,
      bundles: {
        assets: {
          windows: Registry.SimplifiedStatus.PENDING,
          mac: Registry.SimplifiedStatus.PENDING,
          webgl: Registry.SimplifiedStatus.PENDING
        },
        lods: {
          windows: Registry.SimplifiedStatus.PENDING,
          mac: Registry.SimplifiedStatus.PENDING,
          webgl: Registry.SimplifiedStatus.PENDING
        }
      },
      versions: {
        assets: {
          windows: { version: '', buildDate: '' },
          mac: { version: '', buildDate: '' },
          webgl: { version: '', buildDate: '' }
        }
      }
    } as Registry.DbEntity),
    undeployWorldScenes: jest.fn().mockResolvedValue({
      undeployedCount: 0,
      worldName: null
    } as UndeploymentResult)
  }
}
