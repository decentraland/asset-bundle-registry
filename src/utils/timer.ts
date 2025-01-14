import { ILoggerComponent } from '@well-known-components/interfaces'

export async function sleep(ms: number) {
  return new Promise<void>((ok) => setTimeout(ok, ms))
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: {
    logger?: ILoggerComponent.ILogger
    maxRetries?: number
    baseDelay?: number
  }
): Promise<T> {
  const { logger = undefined, maxRetries = 5, baseDelay = 100 } = options || {}

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries - 1
      if (isLastAttempt) throw error

      const delay = baseDelay * Math.pow(2, attempt)
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
