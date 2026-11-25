import { Platform } from 'react-native'
import type { CommonPowerSyncDatabase } from '@powersync/common'
import { PowerSyncDatabase as NativePowerSyncDatabase } from '@powersync/react-native'
import { PowerSyncDatabase as WebPowerSyncDatabase } from '@powersync/web'
import { AppSchema } from './schema'

const DB_FILENAME = 'bizsawa-powersync.db'
const WEB_WORKER_PATH = '/@powersync/worker.js'

let database: CommonPowerSyncDatabase | null = null

export function getPowerSyncDatabase(): CommonPowerSyncDatabase {
  if (database) return database

  if (Platform.OS === 'web') {
    database = new WebPowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: DB_FILENAME,
        worker: WEB_WORKER_PATH,
      },
      sync: {
        worker: WEB_WORKER_PATH,
      },
    })
  } else {
    database = new NativePowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: DB_FILENAME,
      },
    })
  }

  return database
}
