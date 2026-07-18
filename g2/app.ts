// App state and core logic for Bacpacer
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { loadPersistedState, registerBackgroundState, setBridge } from './state'
import { initMenu, updateMenuDisplay } from './renderer'

export async function initApp(appBridge: EvenAppBridge): Promise<void> {
  setBridge(appBridge)
  registerBackgroundState()
  await loadPersistedState()

  appendEventLog('Bacpacer: initialised')
  await initMenu()
  await updateMenuDisplay()
}

export async function updateDisplay(): Promise<void> {
  await updateMenuDisplay()
}
