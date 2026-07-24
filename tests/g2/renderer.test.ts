import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../_shared/log', () => ({
  appendEventLog: vi.fn(),
}))

vi.mock('@evenrealities/even_hub_sdk', () => {
  class BaseContainer {
    constructor(config: Record<string, unknown>) {
      Object.assign(this, config)
    }
  }

  return {
    CreateStartUpPageContainer: BaseContainer,
    ListContainerProperty: BaseContainer,
    ListItemContainerProperty: BaseContainer,
    RebuildPageContainer: BaseContainer,
    TextContainerProperty: BaseContainer,
    TextContainerUpgrade: BaseContainer,
  }
})

import { setBridge, state } from '../../g2/state'
import {
  addDrinkSubmenuItemFromIndex,
  initMenu,
  menuItemFromIndex,
  resetRendererSession,
  resetStandbyHudVisibility,
  toggleStandbyHudVisibility,
  updateMenuDisplay,
  updateTopRightCountdownOnly,
} from '../../g2/renderer'

function makeBridgeMocks() {
  return {
    createStartUpPageContainer: vi.fn(async () => 0),
    rebuildPageContainer: vi.fn(async () => true),
    textContainerUpgrade: vi.fn(async () => true),
  }
}

describe('g2/renderer', () => {
  beforeEach(() => {
    resetRendererSession()
    resetStandbyHudVisibility()

    state.menuVisible = true
    state.addDrinkSubmenuVisible = false
    state.currentMenuItem = 'standBy'
    state.focusedMenuItem = 'standBy'
    state.drinkEntries = []
  })

  it('maps main and add-drink menu indices', () => {
    expect(menuItemFromIndex(0)).toBe('standBy')
    expect(menuItemFromIndex(1)).toBe('adddrink')
    expect(menuItemFromIndex(2)).toBe('setupdrink')
    expect(menuItemFromIndex(3)).toBe('presets')
    expect(menuItemFromIndex(99)).toBeUndefined()

    expect(addDrinkSubmenuItemFromIndex(0)).toBe('Add drink')
    expect(addDrinkSubmenuItemFromIndex(4)).toBe('- %')
    expect(addDrinkSubmenuItemFromIndex(99)).toBeUndefined()
  })

  it('creates page on first menu display and upgrades text containers', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    await updateMenuDisplay()

    expect(bridge.createStartUpPageContainer).toHaveBeenCalledTimes(1)
    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled()
    expect(bridge.textContainerUpgrade).toHaveBeenCalled()
  })

  it('rebuilds page when switching from menu to standby detail layout', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    await updateMenuDisplay()
    state.menuVisible = false
    state.currentMenuItem = 'standBy'
    await updateMenuDisplay()

    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1)
  })

  it('updates detail body text without rebuild when staying in detail layout', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    state.menuVisible = false
    state.currentMenuItem = 'setupdrink'
    await updateMenuDisplay()
    await updateMenuDisplay()

    bridge.rebuildPageContainer.mockClear()
    bridge.textContainerUpgrade.mockClear()

    state.currentMenuItem = 'adddrink'
    state.drinkMl = 250
    state.drinkPercent = 7.5
    await updateMenuDisplay()

    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled()

    const detailUpdate = bridge.textContainerUpgrade.mock.calls
      .map((args) => args[0] as { containerID?: number; content?: string })
      .find((payload) => payload.containerID === 3)

    expect(detailUpdate).toBeDefined()
    expect(detailUpdate?.content).toContain('Add drink')
    expect(detailUpdate?.content).toContain('250 ml')
  })

  it('shows simplified BAC settings in summary details', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    state.menuVisible = false
    state.currentMenuItem = 'setupdrink'
    await updateMenuDisplay()

    const startupPayload = bridge.createStartUpPageContainer.mock.calls[0]?.[0]
    const serializedPayload = JSON.stringify(startupPayload)

    expect(startupPayload).toBeDefined()
    expect(serializedPayload).toContain('Metabolism:')
    expect(serializedPayload).toContain('Food:')
    expect(serializedPayload).not.toContain('Elim beta:')
    expect(serializedPayload).not.toContain('Absorption:')
    expect(serializedPayload).not.toContain('Body water r:')
  })

  it('renders the presets screen as a clickable list with load preset title', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    state.menuVisible = false
    state.currentMenuItem = 'presets'
    state.drinkPresets = [
      { id: 'wine', ml: 150, percent: 13.5 },
      { id: 'beer', ml: 330, percent: 5 },
    ]

    await updateMenuDisplay()

    const startupPayload = bridge.createStartUpPageContainer.mock.calls[0]?.[0] as {
      textObject?: Array<{ containerID?: number; content?: string }>
      listObject?: Array<{ itemContainer?: { itemName?: string[] } }>
    }

    const topLeft = startupPayload.textObject?.find((payload) => payload.containerID === 1)
    expect(topLeft?.content).toBe('Load preset')
    expect(startupPayload.listObject?.[0]?.itemContainer?.itemName).toEqual([
      '150 ml  13.5%',
      '330 ml  5%',
    ])
  })

  it('shows a placeholder item when no presets are available', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    state.menuVisible = false
    state.currentMenuItem = 'presets'
    state.drinkPresets = []

    await updateMenuDisplay()

    const startupPayload = bridge.createStartUpPageContainer.mock.calls[0]?.[0] as {
      listObject?: Array<{ itemContainer?: { itemName?: string[] } }>
      textObject?: Array<{ containerID?: number; content?: string }>
    }

    expect(startupPayload.listObject?.[0]?.itemContainer?.itemName).toEqual(['No presets saved'])

    const rightPanel = startupPayload.textObject?.find((payload) => payload.containerID === 4)
    expect(rightPanel?.content).toBe('Add presets from phone')
  })

  it('toggles standby hud only in standby detail context', () => {
    state.menuVisible = true
    expect(toggleStandbyHudVisibility()).toBe(false)

    state.menuVisible = false
    state.currentMenuItem = 'standBy'
    expect(toggleStandbyHudVisibility()).toBe(true)
    expect(toggleStandbyHudVisibility()).toBe(false)

    state.menuVisible = true
    expect(toggleStandbyHudVisibility()).toBe(false)
  })


  it('updates top-right countdown only after containers exist', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    await updateTopRightCountdownOnly()
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled()

    await initMenu()
    await updateTopRightCountdownOnly()

    const topRightUpdate = bridge.textContainerUpgrade.mock.calls
      .map((args) => args[0] as { containerID?: number })
      .find((payload) => payload.containerID === 2)

    expect(topRightUpdate).toBeDefined()
  })

  it('shows current time on top-left in standby detail and hides it with standby hud', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)
    vi.spyOn(Date, 'now').mockReturnValue(0)

    state.menuVisible = false
    state.currentMenuItem = 'standBy'
    await updateMenuDisplay()

    const visibleTopLeft = bridge.textContainerUpgrade.mock.calls
      .map((args) => args[0] as { containerID?: number; content?: string })
      .find((payload) => payload.containerID === 1)

    expect(visibleTopLeft).toBeDefined()
    expect(visibleTopLeft?.content).toMatch(/^\d{2}:\d{2}$/)

    bridge.textContainerUpgrade.mockClear()
    expect(toggleStandbyHudVisibility()).toBe(true)
    await updateMenuDisplay()

    const hiddenTopLeft = bridge.textContainerUpgrade.mock.calls
      .map((args) => args[0] as { containerID?: number; content?: string })
      .find((payload) => payload.containerID === 1)

    expect(hiddenTopLeft).toBeDefined()
    expect(hiddenTopLeft?.content).toBe(' ')
  })

  it('forces next render to rebuild layout after a text upgrade failure', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    let firstUpgrade = true
    bridge.textContainerUpgrade.mockImplementation(async () => {
      if (firstUpgrade) {
        firstUpgrade = false
        return false
      }
      return true
    })

    await updateMenuDisplay()
    expect(bridge.createStartUpPageContainer).toHaveBeenCalledTimes(1)

    bridge.createStartUpPageContainer.mockClear()
    await updateMenuDisplay()

    expect(bridge.createStartUpPageContainer).toHaveBeenCalledTimes(1)
  })

  it('shows down-right trend arrow when BAC is falling', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    const now = Date.now()
    state.drinkEntries = [{
      ml: 600,
      percent: 5,
      timestampMs: now - (120 * 60 * 1000),
      endTimestampMs: now - (90 * 60 * 1000),
    }]
    state.menuVisible = false
    state.currentMenuItem = 'setupdrink'

    await updateMenuDisplay()

    const bottomRightUpdate = bridge.textContainerUpgrade.mock.calls
      .map((args) => args[0] as { containerID?: number; content?: string })
      .find((payload) => payload.containerID === 6)

    expect(bottomRightUpdate).toBeDefined()
    expect(bottomRightUpdate?.content).toContain('↘')
  })

  it('replaces detailed peak BAC line with compact down-right trend in summary when falling', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    const now = Date.now()
    state.drinkEntries = [{
      ml: 600,
      percent: 5,
      timestampMs: now - (120 * 60 * 1000),
      endTimestampMs: now - (90 * 60 * 1000),
    }]
    state.menuVisible = false
    state.currentMenuItem = 'setupdrink'

    await updateMenuDisplay()

    const summaryUpdate = bridge.textContainerUpgrade.mock.calls
      .map((args) => args[0] as { containerID?: number; content?: string })
      .find((payload) => payload.containerID === 4)

    expect(summaryUpdate).toBeDefined()
    expect(summaryUpdate?.content).toContain('Peak BAC: ↘')
    expect(summaryUpdate?.content).not.toContain('Peak BAC at')
  })

  it('shows rising peak BAC in the bottom-left container on first render', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    const now = Date.now()
    state.drinkEntries = [{
      ml: 600,
      percent: 5,
      timestampMs: now - (10 * 60 * 1000),
      endTimestampMs: now + (20 * 60 * 1000),
    }]

    await updateMenuDisplay()

    const startupPayload = bridge.createStartUpPageContainer.mock.calls[0]?.[0] as {
      textObject?: Array<{ containerID?: number; content?: string }>
    }

    const bottomLeft = startupPayload.textObject?.find((payload) => payload.containerID === 5)
    expect(bottomLeft).toBeDefined()
    expect(bottomLeft?.content).toMatch(/^Peak BAC \d+\.\d{3} at \d{2}:\d{2}$/)
  })

  it('shows rising peak BAC in bottom-left updates across screens and clears it when BAC is falling', async () => {
    const bridge = makeBridgeMocks()
    setBridge(bridge as never)

    const now = Date.now()
    state.drinkEntries = [{
      ml: 600,
      percent: 5,
      timestampMs: now - (10 * 60 * 1000),
      endTimestampMs: now + (20 * 60 * 1000),
    }]

    await updateMenuDisplay()
    bridge.textContainerUpgrade.mockClear()

    state.menuVisible = false
    state.currentMenuItem = 'presets'
    await updateMenuDisplay()

    const risingBottomLeftUpdate = bridge.textContainerUpgrade.mock.calls
      .map((args) => args[0] as { containerID?: number; content?: string })
      .find((payload) => payload.containerID === 5)

    expect(risingBottomLeftUpdate).toBeDefined()
    expect(risingBottomLeftUpdate?.content).toMatch(/^Peak BAC \d+\.\d{3} at \d{2}:\d{2}$/)

    bridge.textContainerUpgrade.mockClear()
    state.drinkEntries = [{
      ml: 600,
      percent: 5,
      timestampMs: now - (120 * 60 * 1000),
      endTimestampMs: now - (90 * 60 * 1000),
    }]

    await updateMenuDisplay()

    const fallingBottomLeftUpdate = bridge.textContainerUpgrade.mock.calls
      .map((args) => args[0] as { containerID?: number; content?: string })
      .find((payload) => payload.containerID === 5)

    expect(fallingBottomLeftUpdate).toBeDefined()
    expect(fallingBottomLeftUpdate?.content).toBe(' ')
  })
})
