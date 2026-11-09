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
const MIN = 60_000

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

  it('rounds the duration of a drink to whole minutes', () => {
    expect(estimateDrinkDurationMs(175, 13.5)).toBe(47 * 60_000) // 47.25 min
    expect(estimateDrinkDurationMs(25, 13.5)).toBe(7 * 60_000) // 6.75 min
    expect(estimateDrinkDurationMs(25, 1)).toBe(60_000) // 0.5 min
  })

  it('calculates the end of a drink from its start, amount and alcohol', () => {
    expect(getDrinkEntryEndTimestampMs({ ml: 200, percent: 10, timestampMs: 1000 })).toBe(2401000)
  })

  it('ignores end times stored by older versions', () => {
    const legacy = { ml: 200, percent: 10, timestampMs: 5000, endTimestampMs: 1000, plannedEndTimestampMs: 9000 }
    expect(getDrinkEntryEndTimestampMs(legacy)).toBe(2405000)
  })

  it('stores only start, amount and alcohol, and leaves earlier drinks untouched', () => {
    const now = 1000000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    state.drinkEntries = [{ ml: 200, percent: 10, timestampMs: now - 60000 }]
    setDrinkMl(300)
    setDrinkPercent(12)

    const created = storeCurrentDrink()
    expect(created).toEqual({ ml: 300, percent: 12, timestampMs: now })
    expect(state.drinkEntries).toEqual([created, { ml: 200, percent: 10, timestampMs: now - 60000 }])
  })

  it('a single unfinished drink is the current countdown', () => {
    state.drinkEntries = [{ ml: 100, percent: 10, timestampMs: 0 }] // 20 min
    expect(getStandbyCountdown(5 * MIN)).toEqual({ activeMinutes: 15, carryOverMinutes: 0 })
  })

  it('a finished drink on its own shows nothing', () => {
    state.drinkEntries = [{ ml: 100, percent: 10, timestampMs: 0 }] // 20 min
    expect(getStandbyCountdown(20 * MIN)).toBeNull()
    expect(getStandbyCountdown(25 * MIN)).toBeNull()
  })

  it('two drinks logged at the same time, read in order from the log', () => {
    // Drink 1 and drink 2: 175 ml at 13.5% (47 min each), both at 12:00. Minutes are counted from 12:00.
    state.drinkEntries = [
      { ml: 175, percent: 13.5, timestampMs: 0 }, // drink 2
      { ml: 175, percent: 13.5, timestampMs: 0 }, // drink 1
    ]
    // 12:10 - drink 1 had 47 left when drink 2 started (+47); drink 2 has 37 left.
    expect(getStandbyCountdown(10 * MIN)).toEqual({ activeMinutes: 37, carryOverMinutes: 47 })
    // 12:50 - drink 2 finished at 12:47; those 3 minutes come off the +47.
    expect(getStandbyCountdown(50 * MIN)).toEqual({ activeMinutes: 0, carryOverMinutes: 44 })
    expect(getStandbyCountdown(93 * MIN)).toEqual({ activeMinutes: 0, carryOverMinutes: 1 })
    expect(getStandbyCountdown(94 * MIN)).toBeNull()
  })

  it('carry-over stays put while a drink is active and counts down once nothing is', () => {
    // Three 20 minute drinks at 0, 5 and 10 min: the first two are cut short with 15 min left each.
    state.drinkEntries = [0, 5, 10].map((m) => ({ ml: 100, percent: 10, timestampMs: m * MIN }))
    expect(getStandbyCountdown(12 * MIN)).toEqual({ activeMinutes: 18, carryOverMinutes: 30 })
    expect(getStandbyCountdown(20 * MIN)).toEqual({ activeMinutes: 10, carryOverMinutes: 30 })
    // The last drink finishes at 30 min; after that the carry-over counts down.
    expect(getStandbyCountdown(40 * MIN)).toEqual({ activeMinutes: 0, carryOverMinutes: 20 })
    expect(getStandbyCountdown(60 * MIN)).toBeNull()
  })

  it('a drink that had already finished when the next was logged adds nothing', () => {
    // 20 minute drinks at 0 and 30 min: the first finished at 20 min.
    state.drinkEntries = [0, 30].map((m) => ({ ml: 100, percent: 10, timestampMs: m * MIN }))
    expect(getStandbyCountdown(35 * MIN)).toEqual({ activeMinutes: 15, carryOverMinutes: 0 })
  })

  it('carry-over counts down in the gap between two drinks', () => {
    // Drinks at 0 and 5 min (20 min each): the first owes 15 min. The second finishes at 25 min.
    // A third drink at 30 min: 5 min of standby have come off the carry-over.
    state.drinkEntries = [0, 5, 30].map((m) => ({ ml: 100, percent: 10, timestampMs: m * MIN }))
    expect(getStandbyCountdown(31 * MIN)).toEqual({ activeMinutes: 19, carryOverMinutes: 10 })
  })

  it('does not depend on the order the entries are stored in', () => {
    state.drinkEntries = [10, 5, 0].map((m) => ({ ml: 100, percent: 10, timestampMs: m * MIN }))
    expect(getStandbyCountdown(12 * MIN)).toEqual({ activeMinutes: 18, carryOverMinutes: 30 })
    state.drinkEntries = [0, 10, 5].map((m) => ({ ml: 100, percent: 10, timestampMs: m * MIN }))
    expect(getStandbyCountdown(12 * MIN)).toEqual({ activeMinutes: 18, carryOverMinutes: 30 })
  })

  it('shows only carry-over when the last drink has finished but an earlier one is still owed', () => {
    state.drinkEntries = [
      { ml: 175, percent: 13.5, timestampMs: 0 }, // 47 min, cut at 1 min with 46 left
      { ml: 25, percent: 13.5, timestampMs: MIN }, // 7 min: 1 to 8 min
    ]
    // At 10 min the last drink finished 2 min ago, so 2 min come off the 46.
    expect(getStandbyCountdown(10 * MIN)).toEqual({ activeMinutes: 0, carryOverMinutes: 44 })
  })

  it('ignores a drink that has not started yet', () => {
    state.drinkEntries = [{ ml: 100, percent: 10, timestampMs: 10 * MIN }]
    expect(getStandbyCountdown(5 * MIN)).toBeNull()
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
      },
      {
        ml: 200,
        percent: 10,
        timestampMs: now - (20 * 60 * 60 * 1000),
      },
    ]

    const estimate = getBacEstimateAt(now)
    expect(estimate.bacGdl).toBeGreaterThan(0)
  })

  it('BAC is still rising while a drink is being consumed', () => {
    const now = 60 * MIN
    // 500 ml at 5% takes 50 min to drink; 10 min in, it is still being absorbed.
    state.drinkEntries = [{ ml: 500, percent: 5, timestampMs: now - 10 * MIN }]
    const estimate = getBacEstimateAt(now)

    expect(estimate.bacGdl).toBeGreaterThan(0)
    expect(estimate.isRisingToPeak).toBe(true)
    expect(estimate.peakAtMs).toBeGreaterThan(now)
  })

  it('updates, resorts, and clamps drink entry values', () => {
    state.drinkEntries = [
      { ml: 100, percent: 5, timestampMs: 1000 },
      { ml: 150, percent: 8, timestampMs: 500 },
    ]

    const updated = updateDrinkEntry(500, { ml: 5000, percent: 120, timestampMs: 3000 })

    expect(updated).toBe(true)
    expect(state.drinkEntries[0]).toEqual({ ml: 2000, percent: 100, timestampMs: 3000 })
    expect(state.drinkEntries[1]?.timestampMs).toBe(1000)
  })

  it('the countdown follows every change to the log: add, edit, delete', () => {
    const nowSpy = vi.spyOn(Date, 'now')
    setDrinkMl(175)
    setDrinkPercent(13.5) // 47 min

    nowSpy.mockReturnValue(0)
    storeCurrentDrink()
    expect(getStandbyCountdown(0)).toEqual({ activeMinutes: 47, carryOverMinutes: 0 })

    // A second drink 1 min later: the first had 46 min left.
    nowSpy.mockReturnValue(MIN)
    storeCurrentDrink()
    expect(getStandbyCountdown(MIN)).toEqual({ activeMinutes: 47, carryOverMinutes: 46 })

    // Edit the first drink down to 25 ml (7 min): 6 min were left when the second was logged.
    expect(updateDrinkEntry(0, { timestampMs: 0, ml: 25, percent: 13.5 })).toBe(true)
    expect(getStandbyCountdown(MIN)).toEqual({ activeMinutes: 47, carryOverMinutes: 6 })

    // A 25 ml drink at 2 min: 6 (first) + 46 (second) behind the +, 7 on the last.
    setDrinkMl(25)
    nowSpy.mockReturnValue(2 * MIN)
    storeCurrentDrink()
    expect(getStandbyCountdown(2 * MIN)).toEqual({ activeMinutes: 7, carryOverMinutes: 52 })

    // Delete the 175 ml drink: the first drink now had 5 min left when the last was logged.
    expect(removeDrinkEntry(MIN)).toBe(true)
    expect(getStandbyCountdown(2 * MIN)).toEqual({ activeMinutes: 7, carryOverMinutes: 5 })
  })

  it('editing the time of a drink moves its end with it', () => {
    state.drinkEntries = [{ ml: 100, percent: 10, timestampMs: 0 }] // ends at 20 min
    expect(getStandbyCountdown(10 * MIN)).toEqual({ activeMinutes: 10, carryOverMinutes: 0 })

    expect(updateDrinkEntry(0, { timestampMs: 5 * MIN, ml: 100, percent: 10 })).toBe(true) // now ends at 25 min
    expect(getStandbyCountdown(10 * MIN)).toEqual({ activeMinutes: 15, carryOverMinutes: 0 })
  })

  it('deleting the last drink makes the one before it the current countdown', () => {
    state.drinkEntries = [5, 0].map((m) => ({ ml: 100, percent: 10, timestampMs: m * MIN }))
    expect(getStandbyCountdown(10 * MIN)).toEqual({ activeMinutes: 15, carryOverMinutes: 15 })

    expect(removeDrinkEntry(5 * MIN)).toBe(true)
    expect(getStandbyCountdown(10 * MIN)).toEqual({ activeMinutes: 10, carryOverMinutes: 0 })
  })

  it('removes and clears drink entries', () => {
    state.drinkEntries = [
      { ml: 100, percent: 5, timestampMs: 1000 },
      { ml: 200, percent: 10, timestampMs: 2000 },
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

  it('clamps preset percent to at least 1 when adding and updating', () => {
    const created = addDrinkPreset({ ml: 250, percent: 0.5 })
    expect(created.percent).toBe(1)
    expect(getDrinkPresets()[0]?.percent).toBe(1)

    const updated = updateDrinkPreset(created.id, { ml: 250, percent: -4 })
    expect(updated).toBe(true)
    expect(getDrinkPresets()[0]?.percent).toBe(1)
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
    expect(state.drinkPercent).toBe(1)
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
    expect(state.drinkPercent).toBe(1)
    expect(state.drinkEntries).toHaveLength(1)
    expect(state.drinkEntries[0]?.ml).toBe(333)
    expect(state.drinkPresets).toHaveLength(2)
    expect(state.drinkPresets[0]).toEqual({ id: 'wine', ml: 150, percent: 13.5 })
    expect(state.drinkPresets[1]?.ml).toBe(2000)
    expect(state.drinkPresets[1]?.percent).toBe(1)
    expect(state.bacSettings.weightKg).toBe(250)
    expect(state.bacSettings.dateOfBirth).toBe('2010-01-01')
    expect(state.bacSettings.ageYears).toBe(18)
    expect(state.bacSettings.heightCm).toBe(230)
    expect('useCustomBodyWaterFactor' in state.bacSettings).toBe(false)
    expect('eliminationRatePerHour' in state.bacSettings).toBe(false)
    expect('absorptionMinutes' in state.bacSettings).toBe(false)
    expect(setLocalStorage).toHaveBeenCalledTimes(1)
  })

  it('loads older saves that stored end times and works the countdown out from the log', async () => {
    const now = 25 * 60 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const getLocalStorage = vi.fn(async () => JSON.stringify({
      drinkEntries: [
        // 20 minute drinks; the stored ends below are ignored.
        { ml: 100, percent: 10, timestampMs: now - (25 * MIN), endTimestampMs: now - (15 * MIN), plannedEndTimestampMs: now - (5 * MIN) },
        { ml: 100, percent: 10, timestampMs: now - (15 * MIN), endTimestampMs: now + (5 * MIN), plannedEndTimestampMs: now + (5 * MIN) },
      ],
    }))

    setBridge({
      getLocalStorage,
      setLocalStorage: vi.fn(async () => undefined),
    } as never)

    await loadPersistedState()

    expect(state.drinkEntries).toHaveLength(2)
    expect(state.drinkEntries.every((entry) => !('endTimestampMs' in entry) && !('plannedEndTimestampMs' in entry))).toBe(true)
    // The first drink was cut when the second started, with 10 min left; the second has 5 min left.
    expect(getStandbyCountdown(now)).toEqual({ activeMinutes: 5, carryOverMinutes: 10 })
  })

  it('restores the countdown from the persisted drink log after reload', async () => {
    const now = 30 * 60 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const getLocalStorage = vi.fn(async () => JSON.stringify({
      drinkEntries: [
        { ml: 100, percent: 10, timestampMs: now - (10 * MIN) }, // 20 min drink, 15 left when the next started
        { ml: 100, percent: 10, timestampMs: now - (5 * MIN) }, // 20 min drink: 15 left
      ],
    }))

    setBridge({
      getLocalStorage,
      setLocalStorage: vi.fn(async () => undefined),
    } as never)

    await loadPersistedState()

    expect(getStandbyCountdown(now)).toEqual({ activeMinutes: 15, carryOverMinutes: 15 })
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
      { ml: 250, percent: 5, timestampMs: Date.now() - 1000 },
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
    const firstCall = setLocalStorage.mock.calls[0]
    expect(firstCall).toBeDefined()
    const payload = firstCall?.[1]
    expect(typeof payload).toBe('string')
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
