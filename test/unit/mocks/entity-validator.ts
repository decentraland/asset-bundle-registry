import { IEntityValidatorComponent } from '../../../src/types'

export function createEntityValidatorMockComponent(): jest.Mocked<IEntityValidatorComponent> {
  return {
    validate: jest.fn().mockReturnValue({ ok: true })
  }
}
