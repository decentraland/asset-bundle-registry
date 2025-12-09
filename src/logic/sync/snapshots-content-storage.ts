import * as fs from 'fs'
import {
  createFsComponent,
  createFolderBasedFileSystemContentStorage,
  IContentStorageComponent
} from '@dcl/catalyst-storage'

import { AppComponents } from '../../types'

export const SNAPSHOT_DOWNLOAD_FOLDER = '/tmp/dcl-snapshots'

export async function createSnapshotContentStorage({
  logs
}: Pick<AppComponents, 'logs' | 'config'>): Promise<IContentStorageComponent> {
  const logger = logs.getLogger('snapshot-content-storage')

  // Ensure the folder exists
  if (!fs.existsSync(SNAPSHOT_DOWNLOAD_FOLDER)) {
    fs.mkdirSync(SNAPSHOT_DOWNLOAD_FOLDER, { recursive: true })
    logger.info('Created snapshot storage folder', { SNAPSHOT_DOWNLOAD_FOLDER })
  }

  const fsComponent = createFsComponent()

  const storage = await createFolderBasedFileSystemContentStorage(
    {
      fs: fsComponent,
      logs: logs
    },
    SNAPSHOT_DOWNLOAD_FOLDER,
    { disablePrefixHash: true } // Simple flat structure
  )

  logger.info('Snapshot content storage initialized', { directory: SNAPSHOT_DOWNLOAD_FOLDER })

  return storage
}
