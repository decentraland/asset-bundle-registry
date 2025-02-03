import { ILoggerComponent } from '@well-known-components/interfaces'

export function sliceArray<T>(array: T[], n: number): T[][] {
  const batches: T[][] = []

  for (let i = 0; i < array.length; i += n) {
    batches.push(array.slice(i, i + n))
  }

  return batches
}

export async function asyncWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  baseDelay: number = 3000,
  logger?: ILoggerComponent.ILogger
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1
      if (isLastAttempt) throw error

      const delay = baseDelay * Math.pow(2, attempt) // Exponential backoff
      logger?.warn('Operation failed, retrying...', {
        attempt: attempt + 1,
        delay,
        error: error?.message || 'unknown'
      })
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw new Error('Should never reach this point')
}
