import { waitForEvenAppBridge, OsEventTypeList, DeviceConnectType } from '@evenrealities/even_hub_sdk'
import type { SetStatus, AppActions } from '../_shared/app-types'
import { appendEventLog } from '../_shared/log'
import { initApp, updateDisplay } from './app'
import {
  addDrinkPreset,
  clearDrinkEntries,
  getBacEstimateAt,
  getBacEstimateWithSettings,
  getBacSettings,
  getDrinkPresets,
  formatDrinkEntryTime,
  removeDrinkPreset,
  removeDrinkEntry,
  flushPersistedState,
  clearBridge,
  setBacSettings,
  setMenuItem,
  setFocusedMenuItem,
  setAddDrinkSubmenuVisible,
  setDrinkMl,
  setDrinkPercent,
  state,
  storeCurrentDrink,
  updateDrinkPreset,
  updateDrinkEntry,
} from './state'
import {
  addDrinkSubmenuItemFromIndex,
  isStandbyHudHidden,
  menuItemFromIndex,
  resetRendererSession,
  setRenderFailureHandler,
  toggleStandbyHudVisibility,
  updateMenuDisplay,
  updateTopRightCountdownOnly,
} from './renderer'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer))
  })
}

export async function createBacpacerActions(setStatus: SetStatus): Promise<AppActions> {
  let connected = false
  let connecting = false
  let appInForeground = true
  let exitDialogPending = false
  let exitDialogRecoveryTimerId: number | null = null
  let unsubscribeEvenHubEvent: (() => void) | null = null
  let unsubscribeDeviceStatus: (() => void) | null = null
  let refreshTimerId: number | null = null
  let lastStandbyHudToggleAtMs = 0
  let teardownRegistered = false

  const stopRefreshTimer = () => {
    if (refreshTimerId !== null) {
      window.clearTimeout(refreshTimerId)
      refreshTimerId = null
    }
  }

  const clearExitDialogRecoveryTimer = () => {
    if (exitDialogRecoveryTimerId !== null) {
      window.clearTimeout(exitDialogRecoveryTimerId)
      exitDialogRecoveryTimerId = null
    }
  }

  const startRefreshTimer = () => {
    if (!connected) return
    stopRefreshTimer()

    const refreshIntervalMs = 10_000

    const tick = () => {
      if (!connected || !appInForeground) return
      if (!state.menuVisible && state.currentMenuItem === 'standBy' && isStandbyHudHidden()) return
      void updateMenuDisplay()
    }

    const safeTick = () => {
      try {
        tick()
      } catch (err) {
        console.warn('[bacpacer] refresh tick failed', err)
        appendEventLog('Lifecycle: refresh tick error (recovered)')
      }
    }

    const scheduleIn = (delayMs: number) => {
      refreshTimerId = window.setTimeout(() => {
        refreshTimerId = null
        safeTick()
        scheduleIn(refreshIntervalMs)
      }, delayMs)
    }

    // Refresh immediately, then keep dynamic standby HUD content current.
    safeTick()
    scheduleIn(refreshIntervalMs)
  }

  const refreshDisplayIfActive = () => {
    if (!connected || !appInForeground) return
    void updateMenuDisplay()
  }

  const isClickEventType = (eventType: number | undefined, source: 'list' | 'text' | 'sys') => {
    if (eventType === OsEventTypeList.CLICK_EVENT) return true
    // SDK quirk: value 0 may be deserialized as undefined across event sources.
    if (typeof eventType === 'undefined') return true
    return false
  }

  const tryToggleStandbyHud = (eventType: number | undefined, source: 'list' | 'text' | 'sys'): boolean => {
    const atStandbyDetail = !state.menuVisible && state.currentMenuItem === 'standBy'
    if (!atStandbyDetail || !isClickEventType(eventType, source)) return false

    const now = Date.now()
    if ((now - lastStandbyHudToggleAtMs) < 250) return true
    lastStandbyHudToggleAtMs = now

    toggleStandbyHudVisibility()
    refreshDisplayIfActive()
    return true
  }

  const handleDoubleClickNavigation = (bridge: Awaited<ReturnType<typeof waitForEvenAppBridge>>) => {
    const atRootMenu = state.menuVisible && !state.addDrinkSubmenuVisible
    if (atRootMenu) {
      exitDialogPending = true
      scheduleExitDialogRecovery()
      appendEventLog('Menu double-tap: shutDownPageContainer(1)')
      void bridge.shutDownPageContainer(1)
      return
    }
    exitDialogPending = false
    clearExitDialogRecoveryTimer()
    void showMenu()
  }

  const logMenuContext = (stage: string, extra?: string) => {
    const suffix = extra ? ` ${extra}` : ''
    appendEventLog(
      `MenuFlow: ${stage} menuVisible=${String(state.menuVisible)} addSub=${String(state.addDrinkSubmenuVisible)} current=${state.currentMenuItem}${suffix}`,
    )
  }

  const inferForegroundFromInput = () => {
    if (!connected || appInForeground) return
    appInForeground = true
    appendEventLog('Lifecycle: inferred foreground from input')
    startRefreshTimer()
  }

  const scheduleExitDialogRecovery = () => {
    clearExitDialogRecoveryTimer()
    exitDialogRecoveryTimerId = window.setTimeout(() => {
      exitDialogRecoveryTimerId = null
      if (!connected || !exitDialogPending) return

      // Some firmware sequences send enter/exit around the system dialog in
      // different order. If no hard-exit event arrived, recover to active state.
      exitDialogPending = false
      appInForeground = true
      appendEventLog('Lifecycle: exit dialog transition settled (recover active)')
      startRefreshTimer()
      refreshDisplayIfActive()
    }, 2000)
  }

  const cleanupBridgeListeners = () => {
    flushPersistedState()

    const unsubEvent = unsubscribeEvenHubEvent
    const unsubDevice = unsubscribeDeviceStatus
    unsubscribeEvenHubEvent = null
    unsubscribeDeviceStatus = null

    setRenderFailureHandler(null)
    stopRefreshTimer()
    clearExitDialogRecoveryTimer()
    clearBridge()

    // Defer the actual unsubscribe call so it never runs synchronously from
    // within the listener callback that may have triggered this cleanup.
    if (unsubEvent) {
      window.setTimeout(() => {
        try {
          unsubEvent()
          appendEventLog('EvenHub event listener cleaned up')
        } catch (err) {
          console.warn('[bacpacer] cleanup listener failed', err)
        }
      }, 0)
    }

    if (unsubDevice) {
      window.setTimeout(() => {
        try {
          unsubDevice()
        } catch (err) {
          console.warn('[bacpacer] cleanup device status listener failed', err)
        }
      }, 0)
    }
  }

  const registerTeardown = () => {
    if (teardownRegistered) return
    teardownRegistered = true

    const onTeardown = () => {
      cleanupBridgeListeners()
    }

    window.addEventListener('beforeunload', onTeardown)
    window.addEventListener('pagehide', onTeardown)

    window.addEventListener('pageshow', () => {
      if (!connected) return
      appInForeground = true
      appendEventLog('Lifecycle: pageshow')
      startRefreshTimer()
      refreshDisplayIfActive()
    })

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (!connected) return
        appInForeground = true
        appendEventLog('Lifecycle: visibilitychange visible')
        startRefreshTimer()
        refreshDisplayIfActive()
      } else {
        appendEventLog('Lifecycle: visibilitychange hidden')
        appInForeground = false
        stopRefreshTimer()
        flushPersistedState()
      }
    })
  }

  const attemptConnect = async (): Promise<void> => {
    if (connecting) {
      setStatus('Connection already in progress...')
      return
    }
    if (connected) {
      setStatus('Already connected')
      return
    }

    connecting = true

    setStatus('Connecting to Even bridge...')
    appendEventLog(`Bacpacer v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}`)

    try {
      const bridge = await withTimeout(waitForEvenAppBridge(), 6000)

      cleanupBridgeListeners()
      registerTeardown()

      // Use native list menu events for robust selection and highlight.
      unsubscribeEvenHubEvent = bridge.onEvenHubEvent((event) => {
        try {

        if (event.listEvent) {
            inferForegroundFromInput()
            if (exitDialogPending) {
              appendEventLog('Lifecycle: exit dialog dismissed by user input')
              exitDialogPending = false
              clearExitDialogRecoveryTimer()
            }

            if (tryToggleStandbyHud(event.listEvent.eventType, 'list')) {
              return
            }

            const listEventType = event.listEvent.eventType
            if (listEventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
              handleDoubleClickNavigation(bridge)
              return
            }

            if (!state.menuVisible && state.currentMenuItem !== 'presets') return
            const eventType = event.listEvent.eventType ?? 0
            if (eventType === OsEventTypeList.CLICK_EVENT) {
              const index = event.listEvent.currentSelectItemIndex ?? 0
              const itemName = event.listEvent.currentSelectItemName ?? ''
              logMenuContext('list-click', `idx=${index} name="${itemName}"`)

              if (state.addDrinkSubmenuVisible) {
                const submenuItem = addDrinkSubmenuItemFromIndex(index)
                if (submenuItem) {
                  appendEventLog(`MenuFlow: add-submenu-click item="${submenuItem}" idx=${index}`)
                  if (submenuItem === 'Add drink') {
                    const entry = storeCurrentDrink()
                    appendEventLog(`Drink stored: ${entry.ml} ml @ ${entry.percent}% (${formatDrinkEntryTime(entry.timestampMs)})`)
                    // After confirming a drink, open Stand by directly.
                    setAddDrinkSubmenuVisible(false)
                    setMenuItem('standBy')
                    logMenuContext('open-standby-after-add-drink')
                    refreshDisplayIfActive()
                    return
                  } else if (submenuItem === '+ ml') {
                    setDrinkMl(state.drinkMl + 25)
                  } else if (submenuItem === '- ml') {
                    setDrinkMl(state.drinkMl - 25)
                  } else if (submenuItem === '+ %') {
                    setDrinkPercent(state.drinkPercent + 0.5)
                  } else if (submenuItem === '- %') {
                    setDrinkPercent(state.drinkPercent - 0.5)
                  }
                  appendEventLog(`Add drink submenu: ${submenuItem} (ml=${state.drinkMl}, abv=${state.drinkPercent}%)`)
                  refreshDisplayIfActive()
                }
              } else if (!state.menuVisible && state.currentMenuItem === 'presets') {
                const preset = state.drinkPresets[index]
                if (!preset) {
                  appendEventLog(`Preset load ignored idx=${index} (no preset)`)
                  return
                }

                setDrinkMl(preset.ml)
                setDrinkPercent(preset.percent)
                state.currentMenuItem = 'adddrink'
                state.menuVisible = true
                setFocusedMenuItem('adddrink')
                setAddDrinkSubmenuVisible(true)
                appendEventLog(`Preset loaded on glasses: id=${preset.id} ml=${preset.ml} abv=${preset.percent}`)
                logMenuContext('open-add-submenu-after-preset', `preset=${preset.id}`)
                refreshDisplayIfActive()
              } else {
                const selected = menuItemFromIndex(index)
                appendEventLog(`MenuFlow: main-select resolved=${selected ?? 'undefined'} idx=${index} name="${itemName}"`)
                if (selected === 'adddrink') {
                  logMenuContext('open-add-submenu-before')
                  setAddDrinkSubmenuVisible(true)
                  logMenuContext('open-add-submenu-after')
                  refreshDisplayIfActive()
                  return
                }
                if (selected) {
                  logMenuContext('open-detail-before', `selected=${selected}`)
                  setMenuItem(selected)
                  logMenuContext('open-detail-after', `selected=${selected}`)
                  refreshDisplayIfActive()
                }
              }
            }
            return
          }

          if (event.textEvent) {
            inferForegroundFromInput()
            if (exitDialogPending) {
              appendEventLog('Lifecycle: exit dialog dismissed by user input')
              exitDialogPending = false
              clearExitDialogRecoveryTimer()
            }

            if (tryToggleStandbyHud(event.textEvent.eventType, 'text')) {
              return
            }
            return
          }

          if (event.sysEvent) {
            const eventType = event.sysEvent.eventType ?? 0
            if (eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT) {
              appendEventLog('Lifecycle: foreground enter')
              if (exitDialogPending) {
                appendEventLog('Lifecycle: exit dialog transition (enter)')
                scheduleExitDialogRecovery()
                return
              }

              appInForeground = true
              startRefreshTimer()
              refreshDisplayIfActive()
              return
            }
            if (eventType === OsEventTypeList.FOREGROUND_EXIT_EVENT) {
              appendEventLog('Lifecycle: foreground exit')
              if (exitDialogPending) {
                appendEventLog('Lifecycle: exit dialog transition (exit)')
                scheduleExitDialogRecovery()
                return
              }
              appInForeground = false
              stopRefreshTimer()
              return
            }
            if (eventType === OsEventTypeList.ABNORMAL_EXIT_EVENT || eventType === OsEventTypeList.SYSTEM_EXIT_EVENT) {
              appendEventLog(`Lifecycle: exit event=${String(eventType)}`)
              const intentionalExit = exitDialogPending
              appInForeground = false
              exitDialogPending = false
              clearExitDialogRecoveryTimer()
              cleanupBridgeListeners()
              resetRendererSession()
              connected = false

              if (intentionalExit) {
                appendEventLog('Lifecycle: intentional exit confirmed')
                setStatus('Exited by user')
                return
              }

              setStatus('Disconnected. Tap Connect to reconnect.')
              return
            }

            // Some firmware paths can miss FOREGROUND_ENTER after overlay dismissal.
            inferForegroundFromInput()

            if (tryToggleStandbyHud(event.sysEvent.eventType, 'sys')) {
              return
            }

            if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
              handleDoubleClickNavigation(bridge)
            }
          }
        } catch (err) {
          console.error('[bacpacer] event handler failed', err)
          appendEventLog('Lifecycle: event handler error (recovered)')
        }
      })

      unsubscribeDeviceStatus = bridge.onDeviceStatusChanged((status) => {
        try {
          if (
            connected
            && (status.connectType === DeviceConnectType.Disconnected
              || status.connectType === DeviceConnectType.ConnectionFailed)
          ) {
            appendEventLog(`Lifecycle: device status ${String(status.connectType)}`)
            appInForeground = false
            exitDialogPending = false
            clearExitDialogRecoveryTimer()
            cleanupBridgeListeners()
            resetRendererSession()
            connected = false
            setStatus('Disconnected. Tap Connect to reconnect.')
          }
        } catch (err) {
          console.warn('[bacpacer] device status handler failed', err)
        }
      })

      try {
        await initApp(bridge)
      } catch (err) {
        console.error('[bacpacer] initApp failed', err)
        cleanupBridgeListeners()
        setStatus('Initialization failed. Tap Connect to retry.')
        appendEventLog('Lifecycle: initApp failed (recovered)')
        return
      }

      setRenderFailureHandler((_err) => {
        if (!connected) return
        appendEventLog('Lifecycle: repeated render failures detected')
        appInForeground = false
        exitDialogPending = false
        clearExitDialogRecoveryTimer()
        cleanupBridgeListeners()
        resetRendererSession()
        connected = false
        setStatus('Disconnected. Tap Connect to reconnect.')
      })

      connected = true
      appInForeground = true
      exitDialogPending = false
      clearExitDialogRecoveryTimer()
      startRefreshTimer()
      setStatus('Connected. Swipe to focus, click to open, double-click to go back.')
      appendEventLog('Bridge connected - list menu ready')
    } catch (err) {
      console.error('[bacpacer] connect failed', err)
      setStatus('Bridge not found. Running in mock mode.')
      appendEventLog('Connection failed')
    } finally {
      connecting = false
    }
  }

  return {
    connect: async () => {
      await attemptConnect()
    },

    action: async () => {
      if (!connected) {
        setStatus('Not connected')
        return
      }
      await updateDisplay()
      setStatus('Display updated')
    },

    reset: async () => {
      if (!connected) {
        setStatus('Not connected')
        return
      }

      clearDrinkEntries()
      await updateMenuDisplay()
      void updateTopRightCountdownOnly()
      setStatus('Drink history reset')
      appendEventLog('Drink history reset from phone UI')
    },

    getDrinkEntries: () => [...state.drinkEntries],

    getDrinkPresets: () => getDrinkPresets(),

    addDrinkPreset: (preset) => {
      const created = addDrinkPreset(preset)
      setStatus('Preset added')
      appendEventLog(`Preset added from phone UI: id=${created.id} ml=${created.ml} abv=${created.percent}`)
      return created
    },

    updateDrinkPreset: (id, preset) => {
      const updated = updateDrinkPreset(id, preset)
      if (!updated) return false

      setStatus('Preset updated')
      appendEventLog(`Preset updated from phone UI: id=${id} ml=${preset.ml} abv=${preset.percent}`)
      return true
    },

    removeDrinkPreset: (id) => {
      const removed = removeDrinkPreset(id)
      if (!removed) return false

      setStatus('Preset deleted')
      appendEventLog(`Preset deleted from phone UI: id=${id}`)
      return true
    },

    getBacSettings: () => getBacSettings(),

    updateBacSettings: (next) => {
      setBacSettings(next)
      refreshDisplayIfActive()
    },

    getBacEstimate: () => getBacEstimateAt(),

    previewBacEstimate: (overrideSettings) => getBacEstimateWithSettings(overrideSettings),

    removeDrinkEntry: (timestampMs: number) => {
      const removed = removeDrinkEntry(timestampMs)
      if (!removed) return

      setStatus('Drink removed from log')
      appendEventLog(`Drink removed from phone UI: timestamp=${timestampMs}`)
    },

    updateDrinkEntry: (originalTimestampMs, nextEntry) => {
      const updated = updateDrinkEntry(originalTimestampMs, nextEntry)
      if (!updated) return false

      setStatus('Drink updated')
      appendEventLog(`Drink updated from phone UI: from=${originalTimestampMs} to=${nextEntry.timestampMs} ml=${nextEntry.ml} abv=${nextEntry.percent}`)
      return true
    },
  }
}

async function showMenu(): Promise<void> {
  state.menuVisible = true
  setAddDrinkSubmenuVisible(false)
  setFocusedMenuItem(state.currentMenuItem)
  await updateMenuDisplay()
}
