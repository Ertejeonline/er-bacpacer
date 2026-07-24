import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBackgroundStateSnapshot, restoreBackgroundState } from '../../_shared/background-state'
import {
  addDrinkPreset,
  clearDrinkEntries,
  clearBridge,
  estimateDrinkDurationMs,
  flushPersistedState,
  formatBacGdl,
  formatDrinkEntryTime,
  getBacEstimateAt,
  getBacSettings,
  getBridge,
  getDrinkEntryEndTimestampMs,
  getDrinkEntryPlannedEndTimestampMs,
  getDrinkPresets,
  getStandbyCountdown,
  loadPersistedState,
  registerBackgroundState,
  removeDrinkPreset,
  removeDrinkEntry,
  setAddDrinkSubmenuVisible,
  setBacSettings,
  setBpm,
  setDrinkMl,
  setDrinkPercent,
  setFocusedMenuItem,
  setMenuItem,
  setPacerRunning,
  setBridge,
  state,
  storeCurrentDrink,
  updateDrinkPreset,
  updateDrinkEntry,
} from '../../g2/state'

const DEFAULT_BAC_SETTINGS = { ...state.bacSettings }

function resetState(): void {
  state.startupRendered = false
  state.menuVisible = true
  state.addDrinkSubmenuVisible = false
  state.currentMenuItem = 'standBy'
  state.focusedMenuItem = 'standBy'
  state.pacerRunning = false
  state.bpm = 120
  state.drinkMl = 175
  state.drinkPercent = 13.5
  state.drinkEntries = []
  state.drinkPresets = []
  state.bacSettings = { ...DEFAULT_BAC_SETTINGS }
  setBridge({
    getLocalStorage: async () => null,
    setLocalStorage: async () => undefined,
  } as never)
}

describe('g2/state', () => {
  beforeEach(() => {
    resetState()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calculates drink duration from percent values', () => {
    expect(estimateDrinkDurationMs(100, 5)).toBe(600000)
    expect(estimateDrinkDurationMs(100, 0.05)).toBe(600000)
  })

  it('returns fallback end timestamp when endTimestampMs is missing', () => {
    const entry = {
      ml: 200,
      percent: 10,
      timestampMs: 1000,
    }

    expect(getDrinkEntryEndTimestampMs(entry)).toBe(2401000)
  })

  it('clips invalid explicit endTimestampMs to at least start timestamp', () => {
    const entry = {
      ml: 200,
      percent: 10,
      timestampMs: 5000,
      endTimestampMs: 1000,
    }

    expect(getDrinkEntryEndTimestampMs(entry)).toBe(5000)
  })

  it('stores a drink and trims prior overlapping drink end time', () => {
    const now = 1000000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    state.drinkEntries = [{
      ml: 200,
      percent: 10,
      timestampMs: now - 60000,
      endTimestampMs: now + 600000,
    }]

    setDrinkMl(300)
    setDrinkPercent(12)

    const created = storeCurrentDrink()
    expect(created.timestampMs).toBe(now)
    expect(state.drinkEntries[0]?.timestampMs).toBe(now)
    expect(state.drinkEntries[1]?.endTimestampMs).toBe(now)
    expect(state.drinkEntries[1]?.plannedEndTimestampMs).toBe((now - 60000) + estimateDrinkDurationMs(200, 10))
  })

  it('derives cumulative standby countdown carry-over from interrupted drinks', () => {
    const nowSpy = vi.spyOn(Date, 'now')

    setDrinkMl(100)
    setDrinkPercent(10)
    nowSpy.mockReturnValue(0)
    storeCurrentDrink()

    nowSpy.mockReturnValue(10 * 60_000)
    storeCurrentDrink()

    expect(getStandbyCountdown(10 * 60_000)).toEqual({
      activeMinutes: 20,
      carryOverMinutes: 10,
    })

    nowSpy.mockReturnValue(25 * 60_000)
    storeCurrentDrink()

    expect(getStandbyCountdown(25 * 60_000)).toEqual({
      activeMinutes: 20,
      carryOverMinutes: 15,
    })
  })

  it('returns zero BAC estimate with no entries', () => {
    const estimate = getBacEstimateAt(1000000)
    expect(estimate.bacGdl).toBe(0)
    expect(estimate.peakBacGdl).toBe(0)
    expect(estimate.estimatedSoberAtMs).toBeNull()
  })

  it('returns positive BAC estimate after a recent drink', () => {
    const now = 2000000
    state.drinkEntries = [{
      ml: 500,
      percent: 5,
      timestampMs: now - 10 * 60000,
      endTimestampMs: now,
    }]

    const estimate = getBacEstimateAt(now)
    expect(estimate.bacGdl).toBeGreaterThan(0)
    expect(estimate.peakBacGdl).toBeGreaterThanOrEqual(estimate.bacGdl)
  })

  it('keeps recent BAC positive even when the log contains much older drinks', () => {
    const now = 30 * 60 * 60 * 1000
    state.drinkEntries = [
      {
        ml: 500,
        percent: 5,
        timestampMs: now - (10 * 60 * 1000),
        endTimestampMs: now,
      },
      {
        ml: 200,
        percent: 10,
        timestampMs: now - (20 * 60 * 60 * 1000),
        endTimestampMs: now - ((20 * 60 * 60 * 1000) - (30 * 60 * 1000)),
      },
    ]

    const estimate = getBacEstimateAt(now)
    expect(estimate.bacGdl).toBeGreaterThan(0)
  })

  it('uses explicit drink end times to slow BAC rise while a drink is still being consumed', () => {
    const now = 60 * 60 * 1000

    state.drinkEntries = [{
      ml: 500,
      percent: 5,
      timestampMs: now - (30 * 60 * 1000),
      endTimestampMs: now,
    }]
    const duringDrinkEstimate = getBacEstimateAt(now)

    state.drinkEntries = [{
      ml: 500,
      percent: 5,
      timestampMs: now - (30 * 60 * 1000),
      endTimestampMs: now - (30 * 60 * 1000),
    }]
    const instantDrinkEstimate = getBacEstimateAt(now)

    expect(duringDrinkEstimate.bacGdl).toBeLessThan(instantDrinkEstimate.bacGdl)
  })

  it('updates, resorts, and clamps drink entry values', () => {
    state.drinkEntries = [
      { ml: 100, percent: 5, timestampMs: 1000, endTimestampMs: 2000 },
      { ml: 150, percent: 8, timestampMs: 500, endTimestampMs: 1500 },
    ]

    const updated = updateDrinkEntry(500, {
      ml: 5000,
      percent: 120,
      timestampMs: 3000,
      endTimestampMs: 2000,
    })

    expect(updated).toBe(true)
    expect(state.drinkEntries[0]?.timestampMs).toBe(3000)
    expect(state.drinkEntries[0]?.ml).toBe(2000)
    expect(state.drinkEntries[0]?.percent).toBe(100)
    expect(state.drinkEntries[0]?.endTimestampMs).toBe(3000)
  })

  it('removes and clears drink entries', () => {
    state.drinkEntries = [
      { ml: 100, percent: 5, timestampMs: 1000, endTimestampMs: 2000 },
      { ml: 200, percent: 10, timestampMs: 2000, endTimestampMs: 3000 },
    ]

    expect(removeDrinkEntry(1000)).toBe(true)
    expect(state.drinkEntries).toHaveLength(1)
    expect(removeDrinkEntry(9999)).toBe(false)

    clearDrinkEntries()
    expect(state.drinkEntries).toHaveLength(0)
  })

  it('adds, updates, lists, and removes drink presets', () => {
    const created = addDrinkPreset({ ml: 150, percent: 13.5 })

    expect(created.id).toBeTruthy()
    expect(getDrinkPresets()).toEqual([{ id: created.id, ml: 150, percent: 13.5 }])

    const updated = updateDrinkPreset(created.id, { ml: 1750, percent: 120 })
    expect(updated).toBe(true)
    expect(getDrinkPresets()).toEqual([{ id: created.id, ml: 1750, percent: 100 }])

    expect(removeDrinkPreset(created.id)).toBe(true)
    expect(removeDrinkPreset(created.id)).toBe(false)
    expect(getDrinkPresets()).toEqual([])
  })

  it('clamps bpm, ml and percent values', () => {
    setBpm(10)
    setDrinkMl(-50)
    setDrinkPercent(120)

    expect(state.bpm).toBe(60)
    expect(state.drinkMl).toBe(0)
    expect(state.drinkPercent).toBe(100)

    setBpm(999)
    setDrinkMl(99999)
    setDrinkPercent(-1)

    expect(state.bpm).toBe(200)
    expect(state.drinkMl).toBe(2000)
    expect(state.drinkPercent).toBe(0)
  })

  it('updates menu-related state fields', () => {
    state.menuVisible = true
    setMenuItem('setupdrink')
    setFocusedMenuItem('adddrink')
    setAddDrinkSubmenuVisible(true)

    expect(state.currentMenuItem).toBe('setupdrink')
    expect(state.menuVisible).toBe(false)
    expect(state.focusedMenuItem).toBe('adddrink')
    expect(state.addDrinkSubmenuVisible).toBe(true)
  })

  it('normalizes and clamps BAC settings including custom body water factor', () => {
    setBacSettings({
      weightKg: 10,
      ageYears: 200,
      heightCm: 500,
      sexAtBirth: 'female',
      foodProfile: 'invalid' as never,
    })

    const settings = getBacSettings()
    expect(settings.weightKg).toBe(35)
    expect(settings.ageYears).toBe(100)
    expect(settings.heightCm).toBe(230)
    expect('useCustomBodyWaterFactor' in settings).toBe(false)
    expect('customBodyWaterFactor' in settings).toBe(false)
    expect('bodyWaterFactor' in settings).toBe(false)
    expect('eliminationRatePerHour' in settings).toBe(false)
    expect('absorptionMinutes' in settings).toBe(false)
    expect(settings.foodProfile).toBe('light')
  })

  it('derives age from date of birth when provided', () => {
    const now = new Date()
    const birthYear = now.getFullYear() - 40
    const dob = `${birthYear}-01-01`

    setBacSettings({
      dateOfBirth: dob,
      ageYears: 99,
      weightKg: 70,
      heightCm: 175,
      sexAtBirth: 'male',
    })

    const settings = getBacSettings()
    expect(settings.dateOfBirth).toBe(dob)
    expect(settings.ageYears).toBeGreaterThanOrEqual(39)
    expect(settings.ageYears).toBeLessThanOrEqual(40)
  })

  it('BAC estimate runs without error when body water factor is computed internally', () => {
    setBacSettings({ weightKg: 80, heightCm: 180, sexAtBirth: 'male', dateOfBirth: '1985-01-01' })
    expect(() => getBacEstimateAt(Date.now())).not.toThrow()
  })

  it('hydrates persisted state from bridge, prunes old entries, and re-saves', async () => {
    const now = Date.now()
    const oldEntryTs = now - (25 * 60 * 60 * 1000)

    const setLocalStorage = vi.fn(async () => undefined)
    const getLocalStorage = vi.fn(async () => JSON.stringify({
      bpm: 30,
      pacerRunning: true,
      drinkMl: 2500,
      drinkPercent: -5,
      drinkEntries: [
        { ml: 9999, percent: 999, timestampMs: oldEntryTs, endTimestampMs: oldEntryTs + 1000 },
        { ml: 333, percent: 11.5, timestampMs: now - 1000, endTimestampMs: now + 1000 },
      ],
      drinkPresets: [
        { id: 'wine', ml: 150, percent: 13.5 },
        { ml: 9999, percent: -5 },
      ],
      bacSettings: {
        weightKg: 999,
        sexAtBirth: 'male',
        dateOfBirth: '2010-01-01',
        ageYears: 10,
        heightCm: 500,
        foodProfile: 'heavy',
      },
    }))

    setBridge({
      getLocalStorage,
      setLocalStorage,
    } as never)

    await loadPersistedState()

    expect(state.bpm).toBe(60)
    expect(state.pacerRunning).toBe(true)
    expect(state.drinkMl).toBe(2000)
    expect(state.drinkPercent).toBe(0)
    expect(state.drinkEntries).toHaveLength(1)
    expect(state.drinkEntries[0]?.ml).toBe(333)
    expect(state.drinkPresets).toHaveLength(2)
    expect(state.drinkPresets[0]).toEqual({ id: 'wine', ml: 150, percent: 13.5 })
    expect(state.drinkPresets[1]?.ml).toBe(2000)
    expect(state.drinkPresets[1]?.percent).toBe(0)
    expect(state.bacSettings.weightKg).toBe(250)
    expect(state.bacSettings.dateOfBirth).toBe('2010-01-01')
    expect(state.bacSettings.ageYears).toBe(18)
    expect(state.bacSettings.heightCm).toBe(230)
    expect('useCustomBodyWaterFactor' in state.bacSettings).toBe(false)
    expect('eliminationRatePerHour' in state.bacSettings).toBe(false)
    expect('absorptionMinutes' in state.bacSettings).toBe(false)
    expect(setLocalStorage).toHaveBeenCalledTimes(1)
  })

  it('reconstructs legacy interrupted-drink carry-over when planned finish was not stored', async () => {
    const now = 25 * 60 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const getLocalStorage = vi.fn(async () => JSON.stringify({
      drinkEntries: [
        {
          ml: 100,
          percent: 10,
          timestampMs: now - (25 * 60_000),
          endTimestampMs: now - (15 * 60_000),
        },
        {
          ml: 100,
          percent: 10,
          timestampMs: now - (15 * 60_000),
          endTimestampMs: now + (5 * 60_000),
        },
      ],
    }))

    setBridge({
      getLocalStorage,
      setLocalStorage: vi.fn(async () => undefined),
    } as never)

    await loadPersistedState()

    const activeEntry = state.drinkEntries.find((entry) => entry.timestampMs === now - (15 * 60_000))
    const interruptedEntry = state.drinkEntries.find((entry) => entry.timestampMs === now - (25 * 60_000))

    expect(activeEntry).toBeDefined()
    expect(interruptedEntry).toBeDefined()
    expect(getDrinkEntryPlannedEndTimestampMs(activeEntry!)).toBe(now + (5 * 60_000))
    expect(getDrinkEntryPlannedEndTimestampMs(interruptedEntry!)).toBe(now - (5 * 60_000))
    expect(getStandbyCountdown(now)).toEqual({
      activeMinutes: 5,
      carryOverMinutes: 10,
    })
  })

  it('formats BAC and drink entry time values', () => {
    expect(formatBacGdl(0)).toBe('0.000')
    expect(formatBacGdl(0.12345)).toBe('0.123')
    expect(formatDrinkEntryTime(0)).toMatch(/^\d{2}:\d{2}$/)
  })

  it('updates pacer running state', () => {
    setPacerRunning(true)
    expect(state.pacerRunning).toBe(true)
    setPacerRunning(false)
    expect(state.pacerRunning).toBe(false)
  })

  it('captures persisted state and UI flags in a background snapshot, and restores them', () => {
    registerBackgroundState()

    state.currentMenuItem = 'adddrink'
    state.menuVisible = false
    state.addDrinkSubmenuVisible = true
    state.focusedMenuItem = 'adddrink'
    setDrinkMl(300)
    setDrinkPercent(20)

    const snapshotRaw = getBackgroundStateSnapshot()
    expect(snapshotRaw).toBeTruthy()

    const snapshot = JSON.parse(snapshotRaw) as { bacpacerState?: Record<string, unknown> }
    expect(snapshot.bacpacerState).toBeDefined()
    expect(snapshot.bacpacerState?.currentMenuItem).toBe('adddrink')
    expect(snapshot.bacpacerState?.menuVisible).toBe(false)
    expect(snapshot.bacpacerState?.addDrinkSubmenuVisible).toBe(true)
    expect(snapshot.bacpacerState?.focusedMenuItem).toBe('adddrink')
    expect(snapshot.bacpacerState?.drinkMl).toBe(300)
    expect(snapshot.bacpacerState?.drinkPercent).toBe(20)

    // Simulate the headless WebView resetting to defaults before restore is applied.
    state.currentMenuItem = 'standBy'
    state.menuVisible = true
    state.addDrinkSubmenuVisible = false
    state.focusedMenuItem = 'standBy'
    state.drinkMl = 175
    state.drinkPercent = 13.5

    restoreBackgroundState(snapshotRaw)

    expect(state.currentMenuItem).toBe('adddrink')
    expect(state.menuVisible).toBe(false)
    expect(state.addDrinkSubmenuVisible).toBe(true)
    expect(state.focusedMenuItem).toBe('adddrink')
    expect(state.drinkMl).toBe(300)
    expect(state.drinkPercent).toBe(20)
  })

  it('preserves drink entries across a background snapshot/restore round-trip', () => {
    registerBackgroundState()

    state.drinkEntries = [
      { ml: 250, percent: 5, timestampMs: Date.now() - 1000, endTimestampMs: Date.now() + 1000 },
    ]
    state.drinkPresets = [
      { id: 'preset-1', ml: 150, percent: 13.5 },
    ]

    const snapshotRaw = getBackgroundStateSnapshot()
    state.drinkEntries = []
    state.drinkPresets = []

    restoreBackgroundState(snapshotRaw)

    expect(state.drinkEntries).toHaveLength(1)
    expect(state.drinkEntries[0]?.ml).toBe(250)
    expect(state.drinkPresets).toEqual([{ id: 'preset-1', ml: 150, percent: 13.5 }])
  })
})

describe('g2/state persistence debounce & bridge lifecycle', () => {
  beforeEach(() => {
    resetState()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('coalesces rapid successive writes into a single debounced bridge call', async () => {
    const setLocalStorage = vi.fn(async () => undefined)
    setBridge({
      getLocalStorage: async () => null,
      setLocalStorage,
    } as never)

    setBpm(90)
    setBpm(100)
    setDrinkMl(300)

    // Nothing should have been written yet; the write is debounced.
    expect(setLocalStorage).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()

    expect(setLocalStorage).toHaveBeenCalledTimes(1)
    const [, payload] = setLocalStorage.mock.calls[0] as [string, string]
    expect(JSON.parse(payload).bpm).toBe(100)
    expect(JSON.parse(payload).drinkMl).toBe(300)
  })

  it('flushPersistedState writes immediately and is a no-op when nothing is pending', async () => {
    const setLocalStorage = vi.fn(async () => undefined)
    setBridge({
      getLocalStorage: async () => null,
      setLocalStorage,
    } as never)

    setPacerRunning(true)
    await flushPersistedState()
    expect(setLocalStorage).toHaveBeenCalledTimes(1)

    await flushPersistedState()
    expect(setLocalStorage).toHaveBeenCalledTimes(1)
  })

  it('clearBridge nulls the bridge reference so later calls fall back safely', () => {
    setBridge({
      getLocalStorage: async () => null,
      setLocalStorage: async () => undefined,
    } as never)

    expect(getBridge()).not.toBeNull()
    clearBridge()
    expect(getBridge()).toBeNull()
  })
})
