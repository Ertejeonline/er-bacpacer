import { describe, expect, it } from 'vitest'
import { createForegroundTracker } from '../../_shared/foreground-tracker'

describe('foreground tracker', () => {
  it('treats exit without an open overlay as a real background transition', () => {
    const tracker = createForegroundTracker()
    expect(tracker.exit(true)).toBe('background')
  })

  it('ignores exit when the app is already backgrounded', () => {
    const tracker = createForegroundTracker()
    expect(tracker.exit(false)).toBe('ignored')
  })

  it('resumes on enter after a real background transition', () => {
    const tracker = createForegroundTracker()
    expect(tracker.exit(true)).toBe('background')
    expect(tracker.enter(false)).toBe('resume')
  })

  it('keeps the app in front when the system menu opens and closes (enter, exit)', () => {
    const tracker = createForegroundTracker()
    expect(tracker.enter(true)).toBe('overlay-opened')
    expect(tracker.exit(true)).toBe('overlay-closed')
  })

  it('treats the next exit after an overlay closed as a real background transition', () => {
    const tracker = createForegroundTracker()
    tracker.enter(true)
    tracker.exit(true)
    expect(tracker.exit(true)).toBe('background')
  })

  it('still ends in front if the OS reports the menu the other way round (exit, enter)', () => {
    const tracker = createForegroundTracker()
    expect(tracker.exit(true)).toBe('background')
    expect(tracker.enter(false)).toBe('resume')
  })

  it('forgets an open overlay on reset', () => {
    const tracker = createForegroundTracker()
    tracker.enter(true)
    tracker.reset()
    expect(tracker.exit(true)).toBe('background')
  })
})
