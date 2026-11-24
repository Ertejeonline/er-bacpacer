// Body build and body fat, shared by the glasses logic (g2/state.ts) and the
// phone companion page (src/main.ts). Same model as the Android app
// (Build in bacpacer's BacCalculator.kt): alcohol spreads through body water,
// and body water is about 73 % of everything that is not fat.

export type BacBuild = 'veryLean' | 'fit' | 'average' | 'someExtra' | 'lotsExtra'

export const BUILD_OPTIONS: ReadonlyArray<{
  id: BacBuild
  label: string
  description: string
  bodyFatPercent: number
}> = [
  { id: 'veryLean', label: 'Very lean or muscular', description: 'Defined muscles, very little fat', bodyFatPercent: 12 },
  { id: 'fit', label: 'Fit', description: 'Flat stomach, some muscle tone', bodyFatPercent: 20 },
  { id: 'average', label: 'Average', description: 'A bit soft around the middle', bodyFatPercent: 28 },
  { id: 'someExtra', label: 'Some extra weight', description: 'Clearly soft belly, hips or thighs', bodyFatPercent: 36 },
  { id: 'lotsExtra', label: 'A lot of extra weight', description: 'Carrying much more than average', bodyFatPercent: 44 },
]

export const BODY_FAT_PERCENT_LIMITS = { min: 5, max: 60 } as const

export function isBacBuild(value: unknown): value is BacBuild {
  return BUILD_OPTIONS.some((option) => option.id === value)
}

export function getBuildBodyFatPercent(build: BacBuild): number {
  return BUILD_OPTIONS.find((option) => option.id === build)?.bodyFatPercent ?? 28
}

export function getBuildLabel(build: BacBuild): string {
  return BUILD_OPTIONS.find((option) => option.id === build)?.label ?? build
}

// The build whose body fat is closest (bands end halfway between two builds).
export function buildForBodyFat(bodyFatPercent: number): BacBuild {
  if (bodyFatPercent < 16) return 'veryLean'
  if (bodyFatPercent < 24) return 'fit'
  if (bodyFatPercent < 32) return 'average'
  if (bodyFatPercent < 40) return 'someExtra'
  return 'lotsExtra'
}

// Likely body fat from BMI and age (Deurenberg et al. 1991):
// 1.2 x BMI + 0.23 x age - 10.8 x sex - 5.4, sex 1 for men and 0 for women.
// The app does not ask for sex, so it uses 0.5 (halfway); older saves that
// still hold a sex use it once, when they are converted.
export function estimateBodyFatPercent(heightCm: number, weightKg: number, ageYears: number, sexFactor = 0.5): number {
  const heightM = heightCm / 100
  const bmi = weightKg / (heightM * heightM)
  return 1.2 * bmi + 0.23 * ageYears - 10.8 * sexFactor - 5.4
}

// The build suggested from height, weight and age, used until the user picks one.
export function suggestBuild(heightCm: number, weightKg: number, ageYears: number, sexFactor = 0.5): BacBuild {
  return buildForBodyFat(estimateBodyFatPercent(heightCm, weightKg, ageYears, sexFactor))
}
