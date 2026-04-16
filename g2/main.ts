import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
import type { AppActions, SetStatus } from '../_shared/app-types'
import { appendEventLog } from '../_shared/log'
import { initApp, nextScreen } from './app'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer))
  })
}

export function createDemoActions(setStatus: SetStatus): AppActions {
  let connected = false

  return {
    async connect() {
      setStatus('Connecting to Even bridge...')
      appendEventLog(`G2 Demo v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}`)

      try {
        const bridge = await withTimeout(waitForEvenAppBridge(), 6000)
        await initApp(bridge)
        connected = true
        setStatus('Connected. Tap to interact, double-tap to go back.')
        appendEventLog('Bridge connected')
      } catch (err) {
        console.error('[demo] connect failed', err)
        setStatus('Bridge not found. Running in mock mode.')
        appendEventLog('Connection failed')
      }
    },
    async action() {
      if (!connected) {
        setStatus('Not connected')
        return
      }
      await nextScreen()
      setStatus('Showing next demo')
    },
  }
}
