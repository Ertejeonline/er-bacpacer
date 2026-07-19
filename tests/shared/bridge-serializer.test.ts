import { describe, expect, it, vi } from 'vitest'
import { executeSerialized, resetBridgeSerializer, withTimeout } from '../../_shared/bridge-serializer'

describe('_shared/bridge-serializer', () => {
  it('runs a single call and resolves its value', async () => {
    resetBridgeSerializer()
    const result = await executeSerialized(async () => 42)
    expect(result).toBe(42)
  })

  it('never runs two calls concurrently', async () => {
    resetBridgeSerializer()
    let active = 0
    let maxActive = 0

    const makeTask = () => async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 10))
      active -= 1
      return active
    }

    await Promise.all([
      executeSerialized(makeTask()),
      executeSerialized(makeTask()),
      executeSerialized(makeTask()),
    ])

    expect(maxActive).toBe(1)
  })

  it('continues processing the queue after a call rejects', async () => {
    resetBridgeSerializer()

    const first = executeSerialized(async () => {
      throw new Error('boom')
    }).catch((err: unknown) => err)

    const second = executeSerialized(async () => 'ok')

    await expect(first).resolves.toBeInstanceOf(Error)
    await expect(second).resolves.toBe('ok')
  })

  it('rejects a call that exceeds its timeout budget', async () => {
    vi.useFakeTimers()
    resetBridgeSerializer()

    const pending = executeSerialized(
      () => new Promise(() => {}),
      50,
      'slow call',
    )

    const assertion = expect(pending).rejects.toThrow(/timed out after 50ms/)
    await vi.advanceTimersByTimeAsync(50)
    await assertion

    vi.useRealTimers()
  })

  it('withTimeout resolves normally when the promise settles first', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1000)).resolves.toBe('done')
  })
})
