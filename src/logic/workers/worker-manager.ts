import path from 'path'
import { Worker } from 'worker_threads'
import { IBaseComponent } from '@well-known-components/interfaces'

import { AppComponents } from '../../types'

const databasePurgerWorkerPath = path.resolve(__dirname, './obsolete-registries-purger.js')

function getTimeUntilMidnight(): number {
  const now = new Date()
  const nextMidnight = new Date()
  nextMidnight.setHours(24, 0, 0, 0)
  return nextMidnight.getTime() - now.getTime()
}

export function createWorkerManagerComponent(components: Pick<AppComponents, 'logs' | 'metrics'>): IBaseComponent {
  const logger = components.logs.getLogger('worker-manager')
  const scheduledJobs: Set<NodeJS.Timeout> = new Set()

  async function scheduleDailyWorker(workerToExecute: () => Promise<void>): Promise<void> {
    logger.info(`Executing worker...`)
    try {
      const { end: endMetricTimer } = components.metrics.startTimer('worker_run_duration_seconds')
      components.metrics.observe('last_worker_run_timestamp', {}, Date.now())

      await workerToExecute()

      endMetricTimer()
    } catch (error: any) {
      logger.error(`Error during worker execution:`, {
        message: error?.message || 'Unknown error',
        stack: error?.stack || 'No stack trace available'
      })
    }
  }

  async function databasePurgerWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(databasePurgerWorkerPath)

      worker.on('message', (msg) => {
        logger.info(`Worker message: ${msg}`)
      })

      worker.on('error', (error: any) => {
        logger.error('Worker error:', error)
        reject(error)
      })

      worker.on('exit', (code) => {
        if (code === 0) {
          logger.info('Worker completed successfully')
          resolve()
        } else {
          const errorMsg = `Worker stopped with exit code ${code}`
          logger.error(errorMsg)
          reject(new Error(errorMsg))
        }
      })
    })
  }

  async function start(): Promise<void> {
    logger.info('Setting up workers...')
    const timeUntilMidnight = getTimeUntilMidnight()
    logger.info(`Time until midnight: ${timeUntilMidnight / 1000}s`)

    // first run at midnight
    const midnightTimeout = setTimeout(async () => {
      await scheduleDailyWorker(databasePurgerWorker)

      // then, every 24hs
      const dailyInterval = setInterval(
        async () => {
          await scheduleDailyWorker(databasePurgerWorker)
        },
        4 * 60 * 60 * 1000
      )

      scheduledJobs.add(dailyInterval)
    }, timeUntilMidnight)

    scheduledJobs.add(midnightTimeout)
  }

  async function stop(): Promise<void> {
    logger.info('Stopping worker scheduler...')
    scheduledJobs.forEach((scheduledJob) => {
      clearTimeout(scheduledJob)
    })

    scheduledJobs.clear()
    logger.info('All scheduled jobs cleared')
  }

  return { start, stop }
}
