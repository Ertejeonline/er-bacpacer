import { describe, expect, it } from 'vitest'
import {
  DRINK_ML_LIMITS,
  DRINK_PERCENT_LIMITS,
  formatDrinkMl,
  formatDrinkPercent,
  parseDrinkInput,
  stepDrinkValue,
} from '../../src/drink-input'

describe('stepDrinkValue', () => {
  it('steps ml by 25 like the glasses', () => {
    expect(stepDrinkValue('175', 1, DRINK_ML_LIMITS, 175)).toBe(200)
    expect(stepDrinkValue('175', -1, DRINK_ML_LIMITS, 175)).toBe(150)
  })

  it('steps percent by 0.5 without floating point drift', () => {
    let value = 13.5
    for (let i = 0; i < 7; i += 1) {
      value = stepDrinkValue(String(value), 1, DRINK_PERCENT_LIMITS, 13.5)
    }
    expect(value).toBe(17)
    expect(stepDrinkValue('13.5', -1, DRINK_PERCENT_LIMITS, 13.5)).toBe(13)
  })

  it('stays within the glasses limits', () => {
    expect(stepDrinkValue('0', -1, DRINK_ML_LIMITS, 175)).toBe(0)
    expect(stepDrinkValue('2000', 1, DRINK_ML_LIMITS, 175)).toBe(2000)
    expect(stepDrinkValue('1', -1, DRINK_PERCENT_LIMITS, 13.5)).toBe(1)
    expect(stepDrinkValue('100', 1, DRINK_PERCENT_LIMITS, 13.5)).toBe(100)
  })

  it('pulls a typed out-of-range value back into range', () => {
    expect(stepDrinkValue('5000', -1, DRINK_ML_LIMITS, 175)).toBe(2000)
  })

  it('starts from the stored default when the field is empty or not a number', () => {
    expect(stepDrinkValue('', 1, DRINK_ML_LIMITS, 175)).toBe(200)
    expect(stepDrinkValue('abc', -1, DRINK_PERCENT_LIMITS, 13.5)).toBe(13)
  })
})

describe('parseDrinkInput', () => {
  it('accepts valid values', () => {
    expect(parseDrinkInput('330', '5')).toEqual({ ok: true, ml: 330, percent: 5 })
    expect(parseDrinkInput('175', '13.5')).toEqual({ ok: true, ml: 175, percent: 13.5 })
  })

  it('rounds ml to whole numbers and percent to one decimal', () => {
    expect(parseDrinkInput('330.4', '4.66')).toEqual({ ok: true, ml: 330, percent: 4.7 })
  })

  it('rejects empty or non-numeric fields', () => {
    expect(parseDrinkInput('', '5').ok).toBe(false)
    expect(parseDrinkInput('330', '').ok).toBe(false)
    expect(parseDrinkInput('abc', '5').ok).toBe(false)
  })

  it('rejects a zero-ml drink and values outside the glasses limits', () => {
    expect(parseDrinkInput('0', '5').ok).toBe(false)
    expect(parseDrinkInput('2025', '5').ok).toBe(false)
    expect(parseDrinkInput('330', '0.5').ok).toBe(false)
    expect(parseDrinkInput('330', '101').ok).toBe(false)
  })

  it('accepts the exact limits', () => {
    expect(parseDrinkInput('2000', '100').ok).toBe(true)
    expect(parseDrinkInput('25', '1').ok).toBe(true)
  })
})

describe('formatting', () => {
  it('shows whole ml and one-decimal percent', () => {
    expect(formatDrinkMl(175)).toBe('175')
    expect(formatDrinkPercent(13.5)).toBe('13.5')
    expect(formatDrinkPercent(5)).toBe('5.0')
  })
})
