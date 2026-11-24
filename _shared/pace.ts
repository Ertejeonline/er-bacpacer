// The user's pace: an amount, its alcohol % and how many minutes it should take.
// Same model as the Android app (Pace in bacpacer's Pace.kt). It sets only the
// countdown (how long each drink "lasts" before the next one), never the BAC
// estimate, which keeps the fixed drink duration (estimateDrinkDurationMs).

export type DrinkPace = {
  ml: number
  percent: number
  minutes: number
}

// 500 ml of 5 % beer every 50 min = 0.5 ml of pure alcohol per minute, the
// app's pace before it could be changed.
export const DEFAULT_PACE: DrinkPace = { ml: 500, percent: 5, minutes: 50 }

export const PACE_LIMITS = {
  ml: { min: 10, max: 2000, step: 10 },
  percent: { min: 1, max: 80, step: 0.5 },
  minutes: { min: 5, max: 240, step: 5 },
} as const

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalizePace(value: Partial<DrinkPace> | undefined | null): DrinkPace {
  const pick = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  return {
    ml: clamp(pick(value?.ml, DEFAULT_PACE.ml), PACE_LIMITS.ml.min, PACE_LIMITS.ml.max),
    percent: clamp(pick(value?.percent, DEFAULT_PACE.percent), PACE_LIMITS.percent.min, PACE_LIMITS.percent.max),
    minutes: Math.round(clamp(pick(value?.minutes, DEFAULT_PACE.minutes), PACE_LIMITS.minutes.min, PACE_LIMITS.minutes.max)),
  }
}

export function isDefaultPace(pace: DrinkPace): boolean {
  return pace.ml === DEFAULT_PACE.ml && pace.percent === DEFAULT_PACE.percent && pace.minutes === DEFAULT_PACE.minutes
}

// How long a drink takes at this pace, in whole minutes: the ratio of the two
// drinks' alcohol, so the default pace gives exactly ml x ABV fraction / 0.5.
// Old saves may hold a percent as a fraction (0.05), like the drink log.
export function paceDrinkMs(pace: DrinkPace, ml: number, percent: number): number {
  const p = normalizePace(pace)
  const drinkPercent = percent >= 1 ? percent : percent * 100
  const minutes = (ml * drinkPercent * p.minutes) / (p.ml * p.percent)
  return Math.max(0, Math.round(minutes) * 60_000)
}

// Pure alcohol the pace allows, in ml (500 ml at 5 % = 25 ml).
export function pacePureAlcoholMl(pace: DrinkPace): number {
  return (pace.ml * pace.percent) / 100
}
