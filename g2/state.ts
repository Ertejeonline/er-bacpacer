import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'

export type Screen =
  | 'menu'
  | 'run-my-app'
  | 'text-basic'
  | 'text-borders'
  | 'text-unicode'
  | 'list-basic'
  | 'list-styled'
  | 'image-fullscreen'
  | 'max-containers'
  | 'events'

export const SCREENS: Screen[] = [
  'menu',
  'run-my-app',
  'text-basic',
  'text-borders',
  'text-unicode',
  'list-basic',
  'list-styled',
  'image-fullscreen',
  'max-containers',
  'events',
]

export const state = {
  screen: 'menu' as Screen,
  startupRendered: false,
  eventCount: 0,
  lastEvent: '',
  unicodePage: 0,
}

let _bridge: EvenAppBridge | null = null

export function getBridge(): EvenAppBridge | null {
  return _bridge
}

export function setBridge(b: EvenAppBridge): void {
  _bridge = b
}
