import type { IFetchComponent } from '@dcl/core-commons'

type FetchResponse = Awaited<ReturnType<IFetchComponent['fetch']>>

/**
 * Releases the socket held by an unconsumed fetch response body.
 *
 * The native (undici) fetch component keeps the underlying socket pinned until
 * the response body is read or cancelled. Any path that discards a response
 * without reading it — an early return, a thrown error, or a HEAD probe — must
 * drain the body to return the socket to the connection pool.
 */
export async function drainResponse(response: FetchResponse): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}
