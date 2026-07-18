export type SetStatus = (text: string) => void

export type DrinkEntry = {
  ml: number
  percent: number
  timestampMs: number
  endTimestampMs?: number
}

export type DrinkPreset = {
  id: string
  ml: number
  percent: number
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

export type AppActions = {
  connect: () => Promise<void>
  action: () => Promise<void>
  reset?: () => Promise<void>
  getDrinkEntries?: () => DrinkEntry[]
  getDrinkPresets?: () => DrinkPreset[]
  addDrinkPreset?: (preset: Omit<DrinkPreset, 'id'>) => DrinkPreset
  updateDrinkPreset?: (id: string, preset: Omit<DrinkPreset, 'id'>) => boolean
  removeDrinkPreset?: (id: string) => boolean
  removeDrinkEntry?: (timestampMs: number) => void
  updateDrinkEntry?: (originalTimestampMs: number, nextEntry: DrinkEntry) => boolean
  getBacSettings?: () => BacUserSettings
  updateBacSettings?: (next: Partial<BacUserSettings>) => void
  getBacEstimate?: () => BacEstimate
  previewBacEstimate?: (overrideSettings: Partial<BacUserSettings>) => BacEstimate
}

export type AppModule = {
  id: string
  name: string
  pageTitle?: string
  connectLabel?: string
  actionLabel?: string
  resetLabel?: string
  initialStatus?: string
  createActions: (setStatus: SetStatus) => Promise<AppActions> | AppActions
}
