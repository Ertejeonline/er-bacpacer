/**
 * Tells a real foreground exit apart from a system overlay closing.
 *
 * The glasses OS fires FOREGROUND_ENTER_EVENT when its contextual menu
 * (tap, then long-press) or exit dialog opens over the app, and
 * FOREGROUND_EXIT_EVENT when it closes. The app stays on screen the whole
 * time, so pausing on that exit would freeze the display.
 *
 * An enter that arrives while the app is already in the foreground marks an
 * overlay as open; the next exit only closes it. An exit with no overlay open
 * is a real background transition (for example another glasses app took the
 * screen), which is the only signal the app gets because the phone WebView
 * stays visible.
 */
export type ForegroundTransition =
  | 'resume' // was backgrounded, now in front again
  | 'overlay-opened' // system overlay opened over the running app
  | 'overlay-closed' // system overlay closed; the app is still in front
  | 'background' // the app really left the foreground
  | 'ignored' // exit while already backgrounded

export type ForegroundTracker = {
  enter(appInForeground: boolean): ForegroundTransition
  exit(appInForeground: boolean): ForegroundTransition
  reset(): void
}

export function createForegroundTracker(): ForegroundTracker {
  let overlayOpen = false

  return {
    enter(appInForeground) {
      if (!appInForeground) {
        overlayOpen = false
        return 'resume'
      }
      overlayOpen = true
      return 'overlay-opened'
    },

    exit(appInForeground) {
      if (overlayOpen) {
        overlayOpen = false
        return 'overlay-closed'
      }
      return appInForeground ? 'background' : 'ignored'
    },

    reset() {
      overlayOpen = false
    },
  }
}
