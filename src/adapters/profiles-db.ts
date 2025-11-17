import SQL from 'sql-template-strings'
import { AppComponents, ProfilesDbComponent } from '../types'
import { Profile } from '../types/profiles'

export function createProfilesDbAdapter({ pg }: Pick<AppComponents, 'pg'>): ProfilesDbComponent {
  async function getProfileByPointer(pointer: string): Promise<Profile.DbEntity | null> {
    const query = SQL`
      SELECT
        id, pointer, timestamp, content, metadata, auth_chain as "authChain", local_timestamp as "localTimestamp"
      FROM
        profiles
      WHERE
        LOWER(pointer) = ${pointer.toLowerCase()}
    `

    const result = await pg.query<Profile.DbEntity>(query)
    return result.rows[0] || null
  }

  async function upsertProfileIfNewer(profile: Profile.DbEntity): Promise<boolean> {
    const query = SQL`
      INSERT INTO profiles (
        id, pointer, timestamp, content, metadata, auth_chain, local_timestamp
      )
      VALUES (
        ${profile.id},
        ${profile.pointer.toLowerCase()},
        ${profile.timestamp},
        ${JSON.stringify(profile.content)}::jsonb,
        ${JSON.stringify(profile.metadata)}::jsonb,
        ${JSON.stringify(profile.authChain)}::jsonb,
        ${profile.localTimestamp}
      )
      ON CONFLICT (pointer) DO UPDATE
      SET
        id = EXCLUDED.id,
        timestamp = EXCLUDED.timestamp,
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata,
        auth_chain = EXCLUDED.auth_chain,
        local_timestamp = EXCLUDED.local_timestamp
      WHERE profiles.timestamp < EXCLUDED.timestamp
      RETURNING id
    `

    const result = await pg.query(query)
    return (result.rowCount ?? 0) > 0
  }

  async function markSnapshotProcessed(hash: string): Promise<void> {
    const query = SQL`
      INSERT INTO processed_profile_snapshots (hash, process_time)
      VALUES (${hash}, NOW())
      ON CONFLICT (hash) DO NOTHING
    `

    await pg.query(query)
  }

  async function isSnapshotProcessed(hash: string): Promise<boolean> {
    const query = SQL`
      SELECT 1 FROM processed_profile_snapshots WHERE hash = ${hash}
    `

    const result = await pg.query(query)
    return (result.rowCount ?? 0) > 0
  }

  async function getLatestProfileTimestamp(): Promise<number | null> {
    const query = SQL`
      SELECT MAX(timestamp) as max_timestamp FROM profiles
    `

    const result = await pg.query<{ max_timestamp: string | null }>(query)
    const maxTimestamp = result.rows[0]?.max_timestamp
    return maxTimestamp ? parseInt(maxTimestamp, 10) : null
  }

  return {
    getProfileByPointer,
    upsertProfileIfNewer,
    markSnapshotProcessed,
    isSnapshotProcessed,
    getLatestProfileTimestamp
  }
}
