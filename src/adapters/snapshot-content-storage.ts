import * as fs from 'fs'
import {
  createFsComponent,
  createFolderBasedFileSystemContentStorage,
  IContentStorageComponent
} from '@dcl/catalyst-storage'

import { AppComponents } from '../types'
import { SNAPSHOT_DOWNLOAD_FOLDER } from '../types/constants'

export async function createSnapshotContentStorage(
  components: Pick<AppComponents, 'logs'>,
  rootFolder: string = SNAPSHOT_DOWNLOAD_FOLDER
): Promise<IContentStorageComponent> {
  const { logs } = components
  const logger = logs.getLogger('snapshot-content-storage')

  // Ensure the folder exists
  if (!fs.existsSync(rootFolder)) {
    fs.mkdirSync(rootFolder, { recursive: true })
    logger.info('Created snapshot storage folder', { rootFolder })
  }

  const fsComponent = createFsComponent()

  const storage = await createFolderBasedFileSystemContentStorage(
    {
      fs: fsComponent,
      logs: logs
    },
    rootFolder,
    { disablePrefixHash: true } // Simple flat structure
  )

  logger.info('Snapshot content storage initialized', { rootFolder })

  return storage
}
