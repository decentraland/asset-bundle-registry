/**
 * Executes a Promise with a timeout
 *
 * Wraps any Promise with a timeout. If the Promise resolves before the timeout,
 * returns the result. If the timeout is reached first, throws an error.
 *
 * @param promise - The Promise to execute
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns The result of the Promise if it resolves before the timeout
 * @throws Error with message "Operation timed out after {timeoutMs}ms" if timeout is reached
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: NodeJS.Timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutHandle!)
    return result
  } catch (error) {
    clearTimeout(timeoutHandle!)
    throw error
  }
}

export interface RetryOptions {
  maxRetries: number
  retryDelayMs: number
  onRetry?: (attempt: number, error: Error) => void
}

/**
 * Executes an async operation with retry logic
 *
 * Retries the operation up to maxRetries times, waiting retryDelayMs between attempts.
 * If all retries fail, throws the last error encountered.
 *
 * @param operation - The async operation to execute (function that returns a Promise)
 * @param options - Retry configuration options
 * @returns The result of the operation if successful
 * @throws The last error encountered if all retries fail
 */
export async function withRetry<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const { maxRetries, retryDelayMs, onRetry } = options || { maxRetries: 3, retryDelayMs: 1000, onRetry: () => {} }
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (onRetry) {
        onRetry(attempt, lastError)
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      }
    }
  }

  throw lastError!
}
