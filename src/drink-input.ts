// Value rules for the phone "Log a drink" pop-up. They match the glasses:
// +/- 25 ml (0-2000 ml) and +/- 0.5 % (1-100 %).

export type DrinkFieldLimits = {
  min: number
  max: number
  step: number
}

export const DRINK_ML_LIMITS: DrinkFieldLimits = { min: 0, max: 2000, step: 25 }
export const DRINK_PERCENT_LIMITS: DrinkFieldLimits = { min: 1, max: 100, step: 0.5 }

// Round to one decimal so repeated 0.5 steps never drift (e.g. 13.499999).
function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10
}

function clamp(value: number, limits: DrinkFieldLimits): number {
  return Math.min(limits.max, Math.max(limits.min, value))
}

/**
 * Applies one -/+ step to the text currently in a field. If the field is empty
 * or not a number, the step starts from `fallback` (the stored default).
 */
export function stepDrinkValue(
  currentText: string,
  direction: -1 | 1,
  limits: DrinkFieldLimits,
  fallback: number,
): number {
  const parsed = Number(currentText)
  const base = currentText.trim() !== '' && Number.isFinite(parsed) ? parsed : fallback
  return roundToTenth(clamp(base + direction * limits.step, limits))
}

export type ParsedDrinkInput =
  | { ok: true; ml: number; percent: number }
  | { ok: false; message: string }

/** Validates the two fields before logging. Out-of-range values are rejected, not clamped. */
export function parseDrinkInput(mlText: string, percentText: string): ParsedDrinkInput {
  const ml = Number(mlText)
  if (mlText.trim() === '' || !Number.isFinite(ml)) {
    return { ok: false, message: 'Enter the amount in ml.' }
  }
  if (ml <= 0 || ml > DRINK_ML_LIMITS.max) {
    return { ok: false, message: `Amount must be more than 0 and at most ${DRINK_ML_LIMITS.max} ml.` }
  }

  const percent = Number(percentText)
  if (percentText.trim() === '' || !Number.isFinite(percent)) {
    return { ok: false, message: 'Enter the alcohol percentage.' }
  }
  if (percent < DRINK_PERCENT_LIMITS.min || percent > DRINK_PERCENT_LIMITS.max) {
    return {
      ok: false,
      message: `Alcohol must be between ${DRINK_PERCENT_LIMITS.min} and ${DRINK_PERCENT_LIMITS.max} %.`,
    }
  }

  return { ok: true, ml: Math.round(ml), percent: roundToTenth(percent) }
}

/** Text shown in the fields: whole ml, percent with one decimal like the rest of the phone UI. */
export function formatDrinkMl(ml: number): string {
  return String(Math.round(ml))
}

export function formatDrinkPercent(percent: number): string {
  return roundToTenth(percent).toFixed(1)
}
