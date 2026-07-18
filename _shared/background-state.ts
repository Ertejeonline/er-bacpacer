import * as sdk from '@evenrealities/even_hub_sdk'

declare global {
  interface Window {
    __getStateSnapshot?: () => string
    __restoreState?: (snapshot: string | Record<string, unknown>) => void
  }
}

type Exporter = () => Record<string, unknown>
type Restorer = (saved: Record<string, unknown>) => void

const exporters = new Map<string, Exporter>()
const restorers = new Map<string, Restorer>()

export function getBackgroundStateSnapshot(): string {
  const result: Record<string, unknown> = {}
  for (const [key, exporter] of exporters.entries()) {
    try {
      result[key] = exporter()
    } catch (err) {
      console.warn(`[background-state] exporter failed for key "${key}"`, err)
    }
  }
  return JSON.stringify(result)
}

export function restoreBackgroundState(snapshot: string | Record<string, unknown>): void {
  try {
    const parsed = (typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot) as Record<string, unknown> | null
    if (!parsed || typeof parsed !== 'object') return

    for (const [key, restorer] of restorers.entries()) {
      if (key in parsed && parsed[key] !== undefined && parsed[key] !== null) {
        restorer(parsed[key] as Record<string, unknown>)
      }
    }
  } catch (err) {
    console.warn('[background-state] restore failed', err)
  }
}

function initGlobalHandlers(): void {
  if (typeof window === 'undefined') return

  if (!window.__getStateSnapshot) {
    window.__getStateSnapshot = getBackgroundStateSnapshot
  }

  if (!window.__restoreState) {
    window.__restoreState = restoreBackgroundState
  }
}

// Looked up dynamically (via a variable key, not a static property/import) so
// bundlers can't tree-shake or warn about a named export this SDK version
// doesn't provide yet. Falls back to the local polyfill below when absent.
const sdkAny = sdk as unknown as Record<string, unknown>
const SET_BACKGROUND_STATE_KEY = 'setBackgroundState'
const ON_BACKGROUND_RESTORE_KEY = 'onBackgroundRestore'

export function setBackgroundState(key: string, exporter: () => Record<string, unknown>): void {
  const nativeSetBackgroundState = sdkAny[SET_BACKGROUND_STATE_KEY]
  if (typeof nativeSetBackgroundState === 'function') {
    (nativeSetBackgroundState as (key: string, exporter: () => Record<string, unknown>) => void)(key, exporter)
    return
  }
  exporters.set(key, exporter)
  initGlobalHandlers()
}

export function onBackgroundRestore(key: string, restorer: (saved: Record<string, unknown>) => void): void {
  const nativeOnBackgroundRestore = sdkAny[ON_BACKGROUND_RESTORE_KEY]
  if (typeof nativeOnBackgroundRestore === 'function') {
    (nativeOnBackgroundRestore as (key: string, restorer: (saved: Record<string, unknown>) => void) => void)(key, restorer)
    return
  }
  restorers.set(key, restorer)
  initGlobalHandlers()
}
