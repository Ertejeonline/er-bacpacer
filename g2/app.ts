import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { state, setBridge, SCREENS } from './state'
import { showMenu } from './renderer'
import { onEvenHubEvent, navigateTo } from './events'

export async function initApp(appBridge: EvenAppBridge): Promise<void> {
  setBridge(appBridge)

  appBridge.onEvenHubEvent((event) => {
    onEvenHubEvent(event)
  })

  appendEventLog('Demo: initialised')
  await showMenu()
}

export async function nextScreen(): Promise<void> {
  const currentIdx = SCREENS.indexOf(state.screen)
  const nextIdx = (currentIdx + 1) % SCREENS.length
  await navigateTo(SCREENS[nextIdx])
}
