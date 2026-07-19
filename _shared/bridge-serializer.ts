/**
 * Shared bridge call serializer and BLE timeout utility.
 * Prevents concurrent bridge calls and dropped BLE packets from freezing or crashing the connection.
 */

let queueTail: Promise<unknown> = Promise.resolve()

export function withTimeout<T>(promise: Promise<T>, ms = 5000, label = 'operation'): Promise<T> {
  if (ms <= 0) return promise
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[Timeout] ${label} timed out after ${ms}ms`))
    }, ms)
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer))
  })
}

export const withBleTimeout = withTimeout

export function executeSerialized<T>(
  fn: () => Promise<T>,
  timeoutMs = 5000,
  label = 'bridge call',
): Promise<T> {
  const next = queueTail.then(async () => {
    return await withTimeout(fn(), timeoutMs, label)
  })
  queueTail = next.catch(() => {})
  return next
}

export function resetBridgeSerializer(): void {
  queueTail = Promise.resolve()
}
