// Application state management
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk'
import { setBackgroundState, onBackgroundRestore } from '../_shared/background-state'

export type MenuItem = 'standBy' | 'adddrink' | 'setupdrink'

export type DrinkEntry = {
  ml: number
  percent: number
  timestampMs: number
  endTimestampMs?: number
}

export type BacFoodProfile = 'empty' | 'light' | 'heavy'
export type BacSexAtBirth = 'male' | 'female'
export type BacMetabolismLevel = 1 | 2 | 3 | 4 | 5

export const METABOLISM_LEVEL_LABELS: Record<BacMetabolismLevel, string> = {
  1: 'Very slow',
  2: 'Slow',
  3: 'Normal',
  4: 'Fast',
  5: 'Very fast',
}

const METABOLISM_LEVEL_ELIMINATION_RATE: Record<BacMetabolismLevel, number> = {
  1: 0.010,
  2: 0.012,
  3: 0.015,
  4: 0.019,
  5: 0.024,
}

export type BacUserSettings = {
  metabolismLevel: BacMetabolismLevel
  weightKg: number
  sexAtBirth: BacSexAtBirth
  dateOfBirth: string | null
  ageYears: number
  heightCm: number
  foodProfile: BacFoodProfile
}

export type BacEstimate = {
  bacGdl: number
  peakBacGdl: number
  peakAtMs: number | null
  isRisingToPeak: boolean
  absorbedAlcoholGrams: number
  hoursSinceFirstDrink: number
  estimatedSoberAtMs: number | null
}

type ModeledDrinkEntry = {
  startMs: number
  endMs: number
  ethanolGrams: number
  totalAssimilationMinutes: number
}

const PERSISTENCE_KEY = 'bacpacer.persisted.v1'

type PersistedState = {
  bpm: number
  pacerRunning: boolean
  drinkMl: number
  drinkPercent: number
  drinkEntries: DrinkEntry[]
  bacSettings: BacUserSettings
}

const BAC_SETTINGS_BOUNDS = {
  metabolismLevel: { min: 1, max: 5 },
  weightKg: { min: 35, max: 250 },
  ageYears: { min: 18, max: 100 },
  heightCm: { min: 130, max: 230 },
} as const

const FOOD_PROFILE_ABSORPTION_MULTIPLIER: Record<BacFoodProfile, number> = {
  empty: 1.0,
  light: 0.8,
  heavy: 0.6,
}

const FOOD_PROFILE_BIOAVAILABILITY: Record<BacFoodProfile, number> = {
  empty: 1.00,
  light: 0.88,
  heavy: 0.75,
}

const BAC_MODEL_ABSORPTION_MINUTES = 30
const BAC_MODEL_BODY_WATER_FACTOR_MIN = 0.4
const BAC_MODEL_BODY_WATER_FACTOR_MAX = 0.9

const DEFAULT_BAC_SETTINGS: BacUserSettings = {
  metabolismLevel: 3,
  weightKg: 75,
  sexAtBirth: 'male',
  dateOfBirth: null,
  ageYears: 30,
  heightCm: 175,
  foodProfile: 'light',
}

const DEFAULT_PERSISTED_STATE: PersistedState = {
  bpm: 120,
  pacerRunning: false,
  drinkMl: 175,
  drinkPercent: 13.5,
  drinkEntries: [],
  bacSettings: { ...DEFAULT_BAC_SETTINGS },
}

export const state = {
  startupRendered: false,
  menuVisible: true, // new state to control menu visibility
  addDrinkSubmenuVisible: false,
  currentMenuItem: 'standBy' as MenuItem,
  focusedMenuItem: 'standBy' as MenuItem,
  pacerRunning: DEFAULT_PERSISTED_STATE.pacerRunning,
  bpm: DEFAULT_PERSISTED_STATE.bpm,
  drinkMl: DEFAULT_PERSISTED_STATE.drinkMl,
  drinkPercent: DEFAULT_PERSISTED_STATE.drinkPercent,
  drinkEntries: [...DEFAULT_PERSISTED_STATE.drinkEntries],
  bacSettings: { ...DEFAULT_BAC_SETTINGS },
}

let _bridge: EvenAppBridge | null = null

export function getBridge(): EvenAppBridge | null {
  return _bridge
}

export function setBridge(b: EvenAppBridge): void {
  _bridge = b
}

function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function getPercentFraction(percent: number): number {
  return percent > 1 ? percent / 100 : percent
}

export function estimateDrinkDurationMs(ml: number, percent: number): number {
  const intervalMinutes = (ml * getPercentFraction(percent)) / 0.5
  return Math.max(0, intervalMinutes * 60_000)
}

export function getDrinkEntryEndTimestampMs(entry: DrinkEntry): number {
  const fallbackEnd = entry.timestampMs + estimateDrinkDurationMs(entry.ml, entry.percent)
  if (typeof entry.endTimestampMs !== 'number') return fallbackEnd
  return Math.max(entry.timestampMs, entry.endTimestampMs)
}

function normalizeFoodProfile(value: unknown): BacFoodProfile {
  if (value === 'empty' || value === 'light' || value === 'heavy') return value
  return DEFAULT_BAC_SETTINGS.foodProfile
}

function normalizeSexAtBirth(value: unknown): BacSexAtBirth {
  if (value === 'male' || value === 'female') return value
  return DEFAULT_BAC_SETTINGS.sexAtBirth
}

function normalizeDateOfBirth(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    !Number.isFinite(year)
    || month < 1
    || month > 12
    || day < 1
    || day > 31
    || date.getUTCFullYear() !== year
    || (date.getUTCMonth() + 1) !== month
    || date.getUTCDate() !== day
  ) {
    return null
  }

  return trimmed
}

function calculateAgeYearsFromDateOfBirth(dateOfBirth: string, now: Date = new Date()): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth)
  if (!match) return DEFAULT_BAC_SETTINGS.ageYears

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  let years = now.getFullYear() - year

  const monthDelta = (now.getMonth() + 1) - month
  const dayDelta = now.getDate() - day
  if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) {
    years -= 1
  }

  return years
}

function calculateBodyWaterFactor(settings: {
  sexAtBirth: BacSexAtBirth
  ageYears: number
  heightCm: number
  weightKg: number
}): number {
  const tbwLiters = settings.sexAtBirth === 'male'
    ? (2.447 - (0.09516 * settings.ageYears) + (0.1074 * settings.heightCm) + (0.3362 * settings.weightKg))
    : (-2.097 + (0.1069 * settings.heightCm) + (0.2466 * settings.weightKg))

  const rawFactor = settings.weightKg > 0 ? tbwLiters / settings.weightKg : BAC_MODEL_BODY_WATER_FACTOR_MIN
  return clampNumber(rawFactor, BAC_MODEL_BODY_WATER_FACTOR_MIN, BAC_MODEL_BODY_WATER_FACTOR_MAX)
}

function normalizeBacSettings(value: Partial<BacUserSettings> | undefined): BacUserSettings {
  const weightKg = clampNumber(
    typeof value?.weightKg === 'number' ? value.weightKg : state.bacSettings.weightKg,
    BAC_SETTINGS_BOUNDS.weightKg.min,
    BAC_SETTINGS_BOUNDS.weightKg.max,
  )

  const dateOfBirth = normalizeDateOfBirth(value?.dateOfBirth)
    ?? normalizeDateOfBirth(state.bacSettings.dateOfBirth)

  const derivedAgeYears = dateOfBirth
    ? calculateAgeYearsFromDateOfBirth(dateOfBirth)
    : undefined

  const ageYears = clampNumber(
    typeof derivedAgeYears === 'number'
      ? derivedAgeYears
      : (typeof value?.ageYears === 'number' ? value.ageYears : state.bacSettings.ageYears),
    BAC_SETTINGS_BOUNDS.ageYears.min,
    BAC_SETTINGS_BOUNDS.ageYears.max,
  )
  const heightCm = clampNumber(
    typeof value?.heightCm === 'number' ? value.heightCm : state.bacSettings.heightCm,
    BAC_SETTINGS_BOUNDS.heightCm.min,
    BAC_SETTINGS_BOUNDS.heightCm.max,
  )
  const sexAtBirth = normalizeSexAtBirth(value?.sexAtBirth)

  const rawMetabolism = typeof value?.metabolismLevel === 'number'
    ? value.metabolismLevel
    : state.bacSettings.metabolismLevel
  const metabolismLevel = clampNumber(
    rawMetabolism,
    BAC_SETTINGS_BOUNDS.metabolismLevel.min,
    BAC_SETTINGS_BOUNDS.metabolismLevel.max,
  ) as BacMetabolismLevel

  return {
    metabolismLevel,
    weightKg,
    sexAtBirth,
    dateOfBirth,
    ageYears,
    heightCm,
    foodProfile: normalizeFoodProfile(value?.foodProfile),
  }
}

const DRINK_ENTRY_MAX_AGE_MS = 24 * 60 * 60 * 1000

function toPersistedState(): PersistedState {
  return {
    bpm: clampNumber(state.bpm, 60, 200),
    pacerRunning: Boolean(state.pacerRunning),
    drinkMl: clampNumber(state.drinkMl, 0, 2000),
    drinkPercent: clampNumber(state.drinkPercent, 0, 100),
    drinkEntries: state.drinkEntries.slice(0, 500).map((entry) => ({
      ml: clampNumber(entry.ml, 0, 2000),
      percent: clampNumber(entry.percent, 0, 100),
      timestampMs: entry.timestampMs,
      endTimestampMs: getDrinkEntryEndTimestampMs(entry),
    })),
    bacSettings: normalizeBacSettings(state.bacSettings),
  }
}

function savePersistedStateToBrowserStorage(serialized: string): void {
  if (!canUseBrowserStorage()) return
  try {
    window.localStorage.setItem(PERSISTENCE_KEY, serialized)
  } catch (err) {
    console.warn('[bacpacer] failed to save persisted state to browser storage', err)
  }
}

export function savePersistedState(): void {
  const serialized = JSON.stringify(toPersistedState())
  const bridge = getBridge()

  if (bridge) {
    void bridge.setLocalStorage(PERSISTENCE_KEY, serialized).catch((err) => {
      console.warn('[bacpacer] failed to save persisted state to bridge storage', err)
      savePersistedStateToBrowserStorage(serialized)
    })
    return
  }

  savePersistedStateToBrowserStorage(serialized)
}

function applyHydratedState(raw: string): void {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>

    if (typeof parsed.bpm === 'number') {
      state.bpm = clampNumber(parsed.bpm, 60, 200)
    }
    if (typeof parsed.pacerRunning === 'boolean') {
      state.pacerRunning = parsed.pacerRunning
    }
    if (typeof parsed.drinkMl === 'number') {
      state.drinkMl = clampNumber(parsed.drinkMl, 0, 2000)
    }
    if (typeof parsed.drinkPercent === 'number') {
      state.drinkPercent = clampNumber(parsed.drinkPercent, 0, 100)
    }
    if (Array.isArray(parsed.drinkEntries)) {
      const now = Date.now()
      const rawEntries = parsed.drinkEntries as unknown[]
      const hydratedEntries = rawEntries
        .filter((entry) => typeof entry === 'object' && entry !== null)
        .map((entry) => {
          const candidate = entry as Partial<DrinkEntry> & { timeHHMM?: string }
          const ml = typeof candidate.ml === 'number' ? clampNumber(candidate.ml, 0, 2000) : state.drinkMl
          const percent = typeof candidate.percent === 'number' ? clampNumber(candidate.percent, 0, 100) : state.drinkPercent
          const timeHHMM = typeof candidate.timeHHMM === 'string' ? candidate.timeHHMM : '00:00'
          const timestampMs = typeof candidate.timestampMs === 'number' ? candidate.timestampMs : timestampFromHHMM(timeHHMM)
          const estimatedEnd = timestampMs + estimateDrinkDurationMs(ml, percent)
          const endTimestampMs = typeof candidate.endTimestampMs === 'number'
            ? Math.max(timestampMs, candidate.endTimestampMs)
            : estimatedEnd
          return { ml, percent, timestampMs, endTimestampMs }
        })
        .filter((entry) => (now - entry.timestampMs) < DRINK_ENTRY_MAX_AGE_MS)
        .slice(0, 500)

      const hadPrunedEntries = hydratedEntries.length < rawEntries.length
      state.drinkEntries = hydratedEntries

      if (hadPrunedEntries) {
        savePersistedState()
      }
    }

    if (parsed.bacSettings && typeof parsed.bacSettings === 'object') {
      state.bacSettings = normalizeBacSettings(parsed.bacSettings)
    }
  } catch (err) {
    console.warn('[bacpacer] failed to parse persisted state', err)
  }
}

function loadPersistedStateFromBrowserStorage(): void {
  if (!canUseBrowserStorage()) return

  try {
    const raw = window.localStorage.getItem(PERSISTENCE_KEY)
    if (!raw) return
    applyHydratedState(raw)
  } catch (err) {
    console.warn('[bacpacer] failed to load persisted state from browser storage', err)
  }
}

export async function loadPersistedState(): Promise<void> {
  const bridge = getBridge()
  if (!bridge) {
    loadPersistedStateFromBrowserStorage()
    return
  }

  try {
    const raw = await bridge.getLocalStorage(PERSISTENCE_KEY)
    if (!raw) {
      loadPersistedStateFromBrowserStorage()
      return
    }
    applyHydratedState(raw)
  } catch (err) {
    console.warn('[bacpacer] failed to load persisted state from bridge storage', err)
    loadPersistedStateFromBrowserStorage()
  }
}

function formatHHMM(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function timestampFromHHMM(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return Date.now()

  const hh = Number(match[1])
  const mm = Number(match[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return Date.now()
  }

  const now = new Date()
  const candidate = new Date(now)
  candidate.setHours(hh, mm, 0, 0)
  if (candidate.getTime() > now.getTime()) {
    candidate.setDate(candidate.getDate() - 1)
  }

  return candidate.getTime()
}

export function setMenuItem(item: MenuItem): void {
  state.currentMenuItem = item
  // Selecting an item opens its content view and hides the menu.
  state.menuVisible = false
}

export function setFocusedMenuItem(item: MenuItem): void {
  state.focusedMenuItem = item
}

export function setAddDrinkSubmenuVisible(visible: boolean): void {
  state.addDrinkSubmenuVisible = visible
}

export function setBpm(value: number): void {
  state.bpm = clampNumber(value, 60, 200)
  savePersistedState()
}

export function setPacerRunning(running: boolean): void {
  state.pacerRunning = running
  savePersistedState()
}

export function setDrinkMl(value: number): void {
  state.drinkMl = clampNumber(value, 0, 2000)
  savePersistedState()
}

export function setDrinkPercent(value: number): void {
  state.drinkPercent = clampNumber(value, 0, 100)
  savePersistedState()
}

export function setBacSettings(next: Partial<BacUserSettings>): void {
  state.bacSettings = normalizeBacSettings({
    ...state.bacSettings,
    ...next,
  })
  savePersistedState()
}

export function getBacSettings(): BacUserSettings {
  return { ...state.bacSettings }
}

function createZeroBacEstimate(): BacEstimate {
  return {
    bacGdl: 0,
    peakBacGdl: 0,
    peakAtMs: null,
    isRisingToPeak: false,
    absorbedAlcoholGrams: 0,
    hoursSinceFirstDrink: 0,
    estimatedSoberAtMs: null,
  }
}

export function getBacEstimateAt(nowMs: number = Date.now()): BacEstimate {
  const entries = state.drinkEntries
    .filter((entry) => (nowMs - getDrinkEntryEndTimestampMs(entry)) < DRINK_ENTRY_MAX_AGE_MS)
    .sort((a, b) => a.timestampMs - b.timestampMs)
  if (entries.length === 0) return createZeroBacEstimate()

  const settings = state.bacSettings
  const bodyWaterFactor = calculateBodyWaterFactor(settings)
  const eliminationRatePerHour = METABOLISM_LEVEL_ELIMINATION_RATE[settings.metabolismLevel]

  const foodAbsorptionMultiplier = FOOD_PROFILE_ABSORPTION_MULTIPLIER[settings.foodProfile]
  const foodBioavailability = FOOD_PROFILE_BIOAVAILABILITY[settings.foodProfile]
  const effectiveAbsorptionMinutes = BAC_MODEL_ABSORPTION_MINUTES / foodAbsorptionMultiplier
  const modeledEntries: ModeledDrinkEntry[] = entries.map((entry) => {
    const startMs = entry.timestampMs
    const endMs = getDrinkEntryEndTimestampMs(entry)
    const percentFraction = getPercentFraction(entry.percent)
    const ethanolGrams = entry.ml * percentFraction * 0.789 * foodBioavailability
    const drinkDurationMinutes = Math.max(0, (endMs - startMs) / 60_000)

    return {
      startMs,
      endMs,
      ethanolGrams,
      totalAssimilationMinutes: drinkDurationMinutes + Math.max(0, effectiveAbsorptionMinutes),
    }
  })

  const getAbsorbedAlcoholGramsAt = (targetMs: number): number => {
    let absorbedAlcoholGramsAtTarget = 0
    for (const entry of modeledEntries) {
      const elapsedMinutes = Math.max(0, (targetMs - entry.startMs) / 60_000)
      const absorbedFraction = entry.totalAssimilationMinutes <= 0
        ? 1
        : Math.min(1, elapsedMinutes / entry.totalAssimilationMinutes)
      absorbedAlcoholGramsAtTarget += entry.ethanolGrams * absorbedFraction
    }
    return absorbedAlcoholGramsAtTarget
  }

  const firstDrinkAtMs = modeledEntries[0].startMs
  const hoursSinceFirstDrink = Math.max(0, (nowMs - firstDrinkAtMs) / 3_600_000)
  const distributionLiters = bodyWaterFactor * settings.weightKg
  const totalEthanolGrams = modeledEntries.reduce((sum, entry) => sum + entry.ethanolGrams, 0)
  const maxRawBac = distributionLiters > 0
    ? totalEthanolGrams / (distributionLiters * 10)
    : 0

  const latestDrinkEndMs = modeledEntries.reduce(
    (latestEndMs, entry) => Math.max(latestEndMs, entry.endMs),
    modeledEntries[0].endMs,
  )
  const absorptionDoneAtMs = latestDrinkEndMs + (effectiveAbsorptionMinutes * 60_000)
  const eliminationWindowMs = eliminationRatePerHour > 0
    ? ((maxRawBac / eliminationRatePerHour) * 3_600_000)
    : 0
  const simulationEndMs = nowMs + Math.min(
    72 * 3_600_000,
    Math.max(4 * 3_600_000, (absorptionDoneAtMs - nowMs) + eliminationWindowMs + (2 * 3_600_000)),
  )

  type SimulationState = {
    currentTimeMs: number
    currentBac: number
    absorbedAlcoholGrams: number
  }

  const advanceSimulationTo = (targetMs: number, simulation: SimulationState): void => {
    if (targetMs <= simulation.currentTimeMs) return

    const absorbedAlcoholAtTarget = getAbsorbedAlcoholGramsAt(targetMs)
    const absorbedAlcoholDelta = Math.max(0, absorbedAlcoholAtTarget - simulation.absorbedAlcoholGrams)
    const absorbedBacDelta = distributionLiters > 0
      ? absorbedAlcoholDelta / (distributionLiters * 10)
      : 0
    const elapsedHours = Math.max(0, (targetMs - simulation.currentTimeMs) / 3_600_000)

    simulation.currentBac = Math.max(0, simulation.currentBac + absorbedBacDelta - (eliminationRatePerHour * elapsedHours))
    simulation.absorbedAlcoholGrams = absorbedAlcoholAtTarget
    simulation.currentTimeMs = targetMs
  }

  const stepMs = 60_000
  const simulation: SimulationState = {
    currentTimeMs: firstDrinkAtMs,
    currentBac: 0,
    absorbedAlcoholGrams: getAbsorbedAlcoholGramsAt(firstDrinkAtMs),
  }

  for (let t = firstDrinkAtMs + stepMs; t < nowMs; t += stepMs) {
    advanceSimulationTo(t, simulation)
  }
  advanceSimulationTo(nowMs, simulation)

  const absorbedAlcoholGrams = simulation.absorbedAlcoholGrams
  const bacGdl = simulation.currentBac
  let estimatedSoberAtMs: number | null = null
  let hadPositiveBac = bacGdl > 0
  let previousBac = bacGdl
  let peakBacGdl = bacGdl
  let peakAtMs = nowMs

  for (let t = nowMs + stepMs; t <= simulationEndMs; t += stepMs) {
    advanceSimulationTo(t, simulation)
    const bacAtT = simulation.currentBac
    if (bacAtT > 0) hadPositiveBac = true

    if (bacAtT > peakBacGdl) {
      peakBacGdl = bacAtT
      peakAtMs = t
    }

    if (hadPositiveBac && previousBac > 0 && bacAtT <= 0) {
      estimatedSoberAtMs = t
      break
    }

    previousBac = bacAtT
  }

  return {
    bacGdl,
    peakBacGdl,
    peakAtMs,
    isRisingToPeak: peakAtMs > nowMs && peakBacGdl > bacGdl,
    absorbedAlcoholGrams,
    hoursSinceFirstDrink,
    estimatedSoberAtMs,
  }
}

export function getBacEstimateWithSettings(overrideSettings: Partial<BacUserSettings>, nowMs: number = Date.now()): BacEstimate {
  const saved = state.bacSettings
  state.bacSettings = normalizeBacSettings({ ...saved, ...overrideSettings })
  const estimate = getBacEstimateAt(nowMs)
  state.bacSettings = saved
  return estimate
}

export function formatBacGdl(value: number): string {
  return value.toFixed(3)
}

export function storeCurrentDrink(): DrinkEntry {
  const now = Date.now()
  const previousLatest = state.drinkEntries[0]
  const estimatedDurationMs = estimateDrinkDurationMs(state.drinkMl, state.drinkPercent)
  const entry: DrinkEntry = {
    ml: clampNumber(state.drinkMl, 0, 2000),
    percent: clampNumber(state.drinkPercent, 0, 100),
    timestampMs: now,
    endTimestampMs: now + estimatedDurationMs,
  }

  if (previousLatest) {
    const previousEnd = getDrinkEntryEndTimestampMs(previousLatest)
    if (previousEnd > now) {
      previousLatest.endTimestampMs = now
    }
  }

  state.drinkEntries = [entry, ...state.drinkEntries].slice(0, 500)
  savePersistedState()
  return entry
}

export function clearDrinkEntries(): void {
  state.drinkEntries = []
  savePersistedState()
}

export function removeDrinkEntry(timestampMs: number): boolean {
  const nextEntries = state.drinkEntries.filter((entry) => entry.timestampMs !== timestampMs)
  if (nextEntries.length === state.drinkEntries.length) {
    return false
  }

  state.drinkEntries = nextEntries
  savePersistedState()
  return true
}

export function updateDrinkEntry(originalTimestampMs: number, nextEntry: DrinkEntry): boolean {
  const index = state.drinkEntries.findIndex((entry) => entry.timestampMs === originalTimestampMs)
  if (index < 0) {
    return false
  }

  const updatedEntry: DrinkEntry = {
    ml: clampNumber(nextEntry.ml, 0, 2000),
    percent: clampNumber(nextEntry.percent, 0, 100),
    timestampMs: nextEntry.timestampMs,
    endTimestampMs: typeof nextEntry.endTimestampMs === 'number'
      ? Math.max(nextEntry.timestampMs, nextEntry.endTimestampMs)
      : (nextEntry.timestampMs + estimateDrinkDurationMs(nextEntry.ml, nextEntry.percent)),
  }

  const nextEntries = [...state.drinkEntries]
  nextEntries[index] = updatedEntry
  nextEntries.sort((a, b) => b.timestampMs - a.timestampMs)
  state.drinkEntries = nextEntries.slice(0, 500)
  savePersistedState()
  return true
}

export function formatDrinkEntryTime(timestampMs: number): string {
  return formatHHMM(new Date(timestampMs))
}

export function registerBackgroundState(): void {
  setBackgroundState('bacpacerState', () => ({
    ...toPersistedState(),
    menuVisible: state.menuVisible,
    addDrinkSubmenuVisible: state.addDrinkSubmenuVisible,
    currentMenuItem: state.currentMenuItem,
    focusedMenuItem: state.focusedMenuItem,
  }))

  onBackgroundRestore('bacpacerState', (saved) => {
    const s = saved as {
      menuVisible?: boolean
      addDrinkSubmenuVisible?: boolean
      currentMenuItem?: MenuItem
      focusedMenuItem?: MenuItem
    } & Partial<PersistedState>

    applyHydratedState(JSON.stringify(s))

    if (typeof s.menuVisible === 'boolean') {
      state.menuVisible = s.menuVisible
    }
    if (typeof s.addDrinkSubmenuVisible === 'boolean') {
      state.addDrinkSubmenuVisible = s.addDrinkSubmenuVisible
    }
    if (s.currentMenuItem) {
      state.currentMenuItem = s.currentMenuItem
    }
    if (s.focusedMenuItem) {
      state.focusedMenuItem = s.focusedMenuItem
    }
  })
}
