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
  calculateWidmarkFactor,
  eliminationShare,
  getBacEstimateAt,
  getBacSettings,
  getBridge,
  getDrinkEntryEndTimestampMs,
  getDrinkEntryPaceEndTimestampMs,
  getPace,
  setPace,
  getDrinkPresets,
  getStandbyCountdown,
  loadPersistedState,
  registerBackgroundState,
  removeDrinkPreset,
  removeDrinkEntry,
  setAddDrinkSubmenuVisible,
  setBacSettings,
  setDrinkMl,
  setDrinkPercent,
  setFocusedMenuItem,
  setMenuItem,
  setBridge,
  state,
  storeCurrentDrink,
  updateDrinkPreset,
  updateDrinkEntry,
} from '../../g2/state'
import { DEFAULT_PACE, isDefaultPace, normalizePace, paceDrinkMs } from '../../_shared/pace'

const DEFAULT_BAC_SETTINGS = { ...state.bacSettings }
const MIN = 60_000

function resetState(): void {
  state.startupRendered = false
  state.menuVisible = true
  state.addDrinkSubmenuVisible = false
  state.currentMenuItem = 'standBy'
  state.focusedMenuItem = 'standBy'
  state.drinkMl = 175
  state.drinkPercent = 13.5
  state.drinkEntries = []
  state.drinkPresets = []
  state.bacSettings = { ...DEFAULT_BAC_SETTINGS }
  state.pace = { ...DEFAULT_PACE }
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

  it('clamps ml and percent values', () => {
    setDrinkMl(-50)
    setDrinkPercent(120)

    expect(state.drinkMl).toBe(0)
    expect(state.drinkPercent).toBe(100)

    setDrinkMl(99999)
    setDrinkPercent(-1)

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
    })

    const settings = getBacSettings()
    expect(settings.dateOfBirth).toBe(dob)
    expect(settings.ageYears).toBeGreaterThanOrEqual(39)
    expect(settings.ageYears).toBeLessThanOrEqual(40)
  })

  // Same model as the Android app: these are the reference values of its
  // BacCalculatorTest (permille there, g/dL here = permille / 10).
  function expectAndroidReference(
    settings: Partial<typeof state.bacSettings>,
    drinks: Array<[ml: number, percent: number, minutesFromNow: number]>,
    bacPermille: number, peakPermille: number, peakMin: number, soberMin: number,
  ): void {
    const now = 1_800_000_000_000
    state.bacSettings = { ...DEFAULT_BAC_SETTINGS, dateOfBirth: null, ...settings }
    state.drinkEntries = drinks.map(([ml, percent, at]) => ({ ml, percent, timestampMs: now + at * MIN }))
    const e = getBacEstimateAt(now)
    expect(e.bacGdl).toBeCloseTo(bacPermille / 10, 8)
    expect(e.peakBacGdl).toBeCloseTo(peakPermille / 10, 8)
    expect(e.peakAtMs).toBe(now + peakMin * MIN)
    expect(e.estimatedSoberAtMs).toBe(now + soberMin * MIN)
    expect(e.isRisingToPeak).toBe(true)
  }

  it('matches the Android app: one beer 10 minutes ago, fit build, light meal', () => {
    expectAndroidReference(
      { build: 'fit', buildChosen: true, weightKg: 75, heightCm: 175, ageYears: 30, metabolismLevel: 3, foodProfile: 'light' },
      [[500, 5, -10]],
      0.027299144133994296, 0.15839608570755534, 85, 197,
    )
  })

  it('matches the Android app: three wines, some extra weight, empty stomach', () => {
    expectAndroidReference(
      { build: 'someExtra', buildChosen: true, weightKg: 62, heightCm: 165, ageYears: 40, metabolismLevel: 2, foodProfile: 'empty' },
      [[175, 13.5, -150], [175, 13.5, -100], [175, 13.5, -50]],
      1.0981036659928165, 1.2242547132592598, 27, 738,
    )
  })

  it('matches the Android app: 15 % body fat known, heavy meal', () => {
    expectAndroidReference(
      { build: 'average', buildChosen: true, bodyFatKnown: true, bodyFatPercent: 15, weightKg: 90, heightCm: 185, ageYears: 25, metabolismLevel: 4, foodProfile: 'heavy' },
      [[40, 40, -20], [330, 5, -5]],
      0.018280067164395727, 0.05762408464102832, 87, 135,
    )
  })

  it('elimination slows down at low levels', () => {
    expect(eliminationShare(1)).toBeCloseTo(1, 12)
    expect(eliminationShare(0)).toBe(0)
    expect(eliminationShare(0.5)).toBeGreaterThan(0.9)
    expect(eliminationShare(0.1)).toBeCloseTo(0.7, 9)
  })

  it('more food means a lower and later peak and an earlier zero', () => {
    const now = 1_800_000_000_000
    state.drinkEntries = [{ ml: 500, percent: 5, timestampMs: now }]
    const results = (['empty', 'light', 'normal', 'heavy'] as const).map((foodProfile) => {
      state.bacSettings = { ...DEFAULT_BAC_SETTINGS, foodProfile }
      return getBacEstimateAt(now)
    })
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i].peakBacGdl).toBeLessThan(results[i - 1].peakBacGdl)
      expect(results[i].peakAtMs!).toBeGreaterThanOrEqual(results[i - 1].peakAtMs!)
      expect(results[i].estimatedSoberAtMs!).toBeLessThanOrEqual(results[i - 1].estimatedSoberAtMs!)
    }
  })

  it('ignores drinks that have not started yet in the BAC estimate', () => {
    state.drinkEntries = [{ ml: 500, percent: 5, timestampMs: 2 * 60 * MIN }]
    expect(getBacEstimateAt(60 * MIN).peakBacGdl).toBe(0)
  })

  it('keeps a normal meal setting', () => {
    setBacSettings({ foodProfile: 'normal' })
    expect(getBacSettings().foodProfile).toBe('normal')
  })

  it('BAC estimate runs without error when body water factor is computed internally', () => {
    setBacSettings({ weightKg: 80, heightCm: 180, build: 'fit', buildChosen: true, dateOfBirth: '1985-01-01' })
    expect(() => getBacEstimateAt(Date.now())).not.toThrow()
  })

  it('derives the Widmark factor from body fat: 0.73 x (1 - fat) / 0.8', () => {
    expect(calculateWidmarkFactor(20)).toBeCloseTo(0.73, 9)
    expect(calculateWidmarkFactor(28)).toBeCloseTo(0.657, 9)
    // More muscle (less fat) means more body water, so a lower BAC.
    expect(calculateWidmarkFactor(12)).toBeGreaterThan(calculateWidmarkFactor(44))
    expect(calculateWidmarkFactor(60)).toBe(0.4)
  })

  it('suggests a build from height, weight and age until the user picks one', () => {
    setBacSettings({ weightKg: 75, heightCm: 175, dateOfBirth: null, ageYears: 30, buildChosen: false })
    expect(getBacSettings().build).toBe('average')
    setBacSettings({ weightKg: 120 })
    expect(getBacSettings().build).toBe('lotsExtra')
    expect(getBacSettings().buildChosen).toBe(false)

    setBacSettings({ build: 'fit', buildChosen: true })
    setBacSettings({ weightKg: 60 })
    expect(getBacSettings().build).toBe('fit')
    expect(getBacSettings().buildChosen).toBe(true)
  })

  it('uses the known body fat instead of the build', () => {
    const now = 1_800_000_000_000
    state.drinkEntries = [{ ml: 500, percent: 5, timestampMs: now - 30 * MIN }]
    setBacSettings({ build: 'average', buildChosen: true, bodyFatKnown: false })
    const fromBuild = getBacEstimateAt(now).bacGdl
    setBacSettings({ bodyFatKnown: true, bodyFatPercent: 28 })
    expect(getBacEstimateAt(now).bacGdl).toBeCloseTo(fromBuild, 12)
    setBacSettings({ bodyFatPercent: 40 })
    expect(getBacEstimateAt(now).bacGdl).toBeGreaterThan(fromBuild)
    setBacSettings({ bodyFatPercent: 99 })
    expect(getBacSettings().bodyFatPercent).toBe(60)
  })

  it('hydrates persisted state from bridge, prunes old entries, and re-saves', async () => {
    const now = Date.now()
    const oldEntryTs = now - (25 * 60 * 60 * 1000)

    const setLocalStorage = vi.fn(async () => undefined)
    const getLocalStorage = vi.fn(async () => JSON.stringify({
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
    // The old "sex at birth" became a build, kept as the user's choice.
    expect('sexAtBirth' in state.bacSettings).toBe(false)
    expect(state.bacSettings.build).toBe('lotsExtra')
    expect(state.bacSettings.buildChosen).toBe(true)
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

    setDrinkMl(250)
    setDrinkMl(300)

    // Nothing should have been written yet; the write is debounced.
    expect(setLocalStorage).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()

    expect(setLocalStorage).toHaveBeenCalledTimes(1)
    const firstCall = setLocalStorage.mock.calls[0]
    expect(firstCall).toBeDefined()
    const payload = firstCall?.[1]
    expect(typeof payload).toBe('string')
    expect(JSON.parse(payload).drinkMl).toBe(300)
  })

  it('flushPersistedState writes immediately and is a no-op when nothing is pending', async () => {
    const setLocalStorage = vi.fn(async () => undefined)
    setBridge({
      getLocalStorage: async () => null,
      setLocalStorage,
    } as never)

    setDrinkMl(300)
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

// Same cases as the Android app's PaceTest: the pace sets the countdown and
// the drinks' end times, never the BAC estimate.
describe('pace', () => {
  beforeEach(() => {
    resetState()
  })

  it('default pace is the old fixed pace', () => {
    for (const [ml, percent] of [[100, 5], [175, 13.5], [25, 13.5], [25, 1], [330, 5], [40, 40], [200, 10]]) {
      expect(paceDrinkMs(DEFAULT_PACE, ml, percent)).toBe(estimateDrinkDurationMs(ml, percent))
    }
  })

  it('the drink of the pace itself takes the pace minutes', () => {
    const pace = { ml: 330, percent: 5, minutes: 45 }
    expect(paceDrinkMs(pace, 330, 5)).toBe(45 * MIN)
    expect(paceDrinkMs(pace, 165, 10)).toBe(45 * MIN)
  })

  it('a slower pace means a longer wait, a faster one a shorter wait', () => {
    state.drinkEntries = [{ ml: 175, percent: 13.5, timestampMs: 0 }]
    expect(getStandbyCountdown(0)).toEqual({ activeMinutes: 47, carryOverMinutes: 0 })
    setPace({ ml: 500, percent: 5, minutes: 100 })
    expect(getStandbyCountdown(0)).toEqual({ activeMinutes: 95, carryOverMinutes: 0 })
    setPace({ ml: 500, percent: 5, minutes: 25 })
    expect(getStandbyCountdown(0)).toEqual({ activeMinutes: 24, carryOverMinutes: 0 })
  })

  it('carry-over follows the pace too', () => {
    setPace({ ml: 300, percent: 5, minutes: 30 })
    // Newest first, as stored.
    state.drinkEntries = [
      { ml: 300, percent: 5, timestampMs: 10 * MIN },
      { ml: 300, percent: 5, timestampMs: 0 },
    ]
    expect(getStandbyCountdown(15 * MIN)).toEqual({ activeMinutes: 25, carryOverMinutes: 20 })
  })

  it('the pace never changes the BAC estimate or how long a drink is absorbed', () => {
    state.drinkEntries = [{ ml: 175, percent: 13.5, timestampMs: 0 }]
    const before = getBacEstimateAt(30 * MIN)
    setPace({ ml: 500, percent: 5, minutes: 100 })
    expect(getBacEstimateAt(30 * MIN)).toEqual(before)
    expect(getDrinkEntryEndTimestampMs(state.drinkEntries[0])).toBe(47 * MIN)
    expect(getDrinkEntryPaceEndTimestampMs(state.drinkEntries[0])).toBe(95 * MIN)
  })

  it('out-of-range values are clamped', () => {
    expect(normalizePace({ ml: 1, percent: 100, minutes: 1 })).toEqual({ ml: 10, percent: 80, minutes: 5 })
    expect(paceDrinkMs({ ml: 0, percent: 0, minutes: 0 }, 175, 13.5)).toBeGreaterThan(0)
    setPace({ minutes: 9999 })
    expect(getPace().minutes).toBe(240)
  })

  it('isDefaultPace', () => {
    expect(isDefaultPace(DEFAULT_PACE)).toBe(true)
    expect(isDefaultPace({ ...DEFAULT_PACE, minutes: 55 })).toBe(false)
  })

  it('is saved, and an older save without a pace gets the default', async () => {
    const stored: Record<string, string> = {}
    setBridge({
      getLocalStorage: async (key: string) => stored[key] ?? null,
      setLocalStorage: async (key: string, value: string) => { stored[key] = value; return undefined },
    } as never)
    setPace({ ml: 330, percent: 4.5, minutes: 40 })
    await flushPersistedState()
    state.pace = { ...DEFAULT_PACE }
    await loadPersistedState()
    expect(getPace()).toEqual({ ml: 330, percent: 4.5, minutes: 40 })

    const key = Object.keys(stored)[0]
    const old = JSON.parse(stored[key])
    delete old.pace
    stored[key] = JSON.stringify(old)
    await loadPersistedState()
    expect(getPace()).toEqual(DEFAULT_PACE)
  })
})
