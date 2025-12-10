import { Schema } from 'ajv'

export const GetProfilesSchema: Schema = {
  type: 'object',
  properties: {
    pointers: {
      type: 'array',
      items: {
        type: 'string',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      minItems: 1
    }
  },
  required: ['pointers']
}
