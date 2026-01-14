import * as Sentry from '@sentry/node'

/**
 * Wraps a component to suppress all Sentry/OpenTelemetry tracing for its methods.
 * Use this for high-volume background components that don't need observability.
 *
 * All methods of the wrapped component will execute without creating spans or transactions,
 * regardless of what Redis, DB, or other auto-instrumented operations they perform.
 */
export function withSuppressedTracing<T extends object>(component: T): T {
  return new Proxy(component, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          return Sentry.suppressTracing(() => value.apply(target, args))
        }
      }
      return value
    }
  })
}

/**
 * Suppress tracing for a single code block.
 * Use this for specific operations within an otherwise-traced component.
 */
export function withoutTracing<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return Sentry.suppressTracing(() => fn())
}
