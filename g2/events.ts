import { OsEventTypeList, type EvenHubEvent } from '@evenrealities/even_hub_sdk'
import { appendEventLog } from '../_shared/log'
import { state, getBridge, SCREENS } from './state'
import type { Screen } from './state'
import {
  showMenu,
  showRunMyApp,
  showTextBasic,
  showTextBorders,
  showTextUnicode,
  showListBasic,
  showListStyled,
  showImageFullscreen,
  showMaxContainers,
  showEvents,
  updateEventsDisplay,
  nextUnicodePage,
} from './renderer'

const EVENT_NAMES: Record<number, string> = {
  [OsEventTypeList.CLICK_EVENT]: 'CLICK',
  [OsEventTypeList.SCROLL_TOP_EVENT]: 'SCROLL_TOP',
  [OsEventTypeList.SCROLL_BOTTOM_EVENT]: 'SCROLL_BOTTOM',
  [OsEventTypeList.DOUBLE_CLICK_EVENT]: 'DOUBLE_CLICK',
}

// --- Event normalisation ---

export function resolveEventType(event: EvenHubEvent): OsEventTypeList | undefined {
  const raw =
    event.listEvent?.eventType ??
    event.textEvent?.eventType ??
    event.sysEvent?.eventType ??
    ((event.jsonData ?? {}) as Record<string, unknown>).eventType ??
    ((event.jsonData ?? {}) as Record<string, unknown>).event_type

  if (typeof raw === 'number') {
    switch (raw) {
      case 0: return OsEventTypeList.CLICK_EVENT
      case 1: return OsEventTypeList.SCROLL_TOP_EVENT
      case 2: return OsEventTypeList.SCROLL_BOTTOM_EVENT
      case 3: return OsEventTypeList.DOUBLE_CLICK_EVENT
      default: return undefined
    }
  }

  if (typeof raw === 'string') {
    const v = raw.toUpperCase()
    if (v.includes('DOUBLE')) return OsEventTypeList.DOUBLE_CLICK_EVENT
    if (v.includes('CLICK')) return OsEventTypeList.CLICK_EVENT
    if (v.includes('SCROLL_TOP') || v.includes('UP')) return OsEventTypeList.SCROLL_TOP_EVENT
    if (v.includes('SCROLL_BOTTOM') || v.includes('DOWN')) return OsEventTypeList.SCROLL_BOTTOM_EVENT
  }

  if (event.listEvent || event.textEvent || event.sysEvent) return OsEventTypeList.CLICK_EVENT

  return undefined
}

// Track selected list index
let selectedIndex = 0

function resolveIndex(event: EvenHubEvent): number {
  const idx = event.listEvent?.currentSelectItemIndex
  if (typeof idx === 'number' && idx >= 0) {
    selectedIndex = idx
    return idx
  }
  return selectedIndex
}

// --- Screen navigation map ---

const SCREEN_SHOW: Record<Screen, () => Promise<void>> = {
  'menu': showMenu,
  'run-my-app': showRunMyApp,
  'text-basic': showTextBasic,
  'text-borders': showTextBorders,
  'text-unicode': showTextUnicode,
  'list-basic': showListBasic,
  'list-styled': showListStyled,
  'image-fullscreen': showImageFullscreen,
  'max-containers': showMaxContainers,
  'events': showEvents,
}

export function navigateTo(screen: Screen): Promise<void> {
  selectedIndex = 0
  return SCREEN_SHOW[screen]()
}

// --- Event dispatcher ---

export function onEvenHubEvent(event: EvenHubEvent): void {
  const eventType = resolveEventType(event)
  const name = eventType !== undefined ? EVENT_NAMES[eventType] ?? String(eventType) : 'unknown'
  appendEventLog(`Event: ${name} screen=${state.screen}`)

  // Events inspector: update live display, double-tap exits
  if (state.screen === 'events') {
    state.eventCount++
    state.lastEvent = name

    if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      void showMenu()
      return
    }

    void updateEventsDisplay()
    return
  }

  // Menu: double-tap exits the app, click selects a demo
  if (state.screen === 'menu') {
    if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      const bridge = getBridge()
      if (bridge) {
        appendEventLog('Menu double-tap: shutDownPageContainer(1)')
        void bridge.shutDownPageContainer(1)
      }
      return
    }

    if (eventType === OsEventTypeList.CLICK_EVENT) {
      const idx = resolveIndex(event)
      const target = SCREENS[idx + 1] // +1 because SCREENS[0] is 'menu'
      if (target) {
        appendEventLog(`Menu: navigating to ${target}`)
        void navigateTo(target)
      }
    }
    return
  }

  // All other screens: double-tap goes back to menu
  if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
    void showMenu()
    return
  }

  // Unicode pages: tap cycles through pages
  if (state.screen === 'text-unicode' && eventType === OsEventTypeList.CLICK_EVENT) {
    void nextUnicodePage()
    return
  }

  // List screens: log clicks
  if ((state.screen === 'list-basic' || state.screen === 'list-styled') &&
      eventType === OsEventTypeList.CLICK_EVENT) {
    const idx = resolveIndex(event)
    const itemName = event.listEvent?.currentSelectItemName ?? '?'
    appendEventLog(`List click: idx=${idx} name="${itemName}"`)
  }
}
