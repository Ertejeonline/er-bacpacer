# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.2] - 2026-11-09

### Fixed
- BAC was about 25% too high. The alcohol was spread over total body water, but blood is only about 80% water, so the volume is now body water ÷ 0.8 (the Widmark factor for a 75 kg, 175 cm, 30 year old man is 0.73, was 0.58). Displayed BAC, peak BAC and sober-at time will be lower than before for the same drinks.
- A heavy meal made a whole drink almost disappear from the BAC (about 9% of the empty-stomach peak). The alcohol share for a heavy meal is now 85% (was 75%), which gives about a third of the empty-stomach peak.

### Removed
- Unused pacer settings (`bpm`, `pacerRunning`) and their dead event handlers. Old saves still load.

## [2.0.1] - 2026-11-09

### Removed
- Tapping once on the Stand by screen no longer hides the display. Even Realities offers this built in.

## [2.0.0] - 2026-11-09

The drink log is now the single source of truth. The countdown and the BAC figures (current, peak, time to peak) are worked out from the log every time they are shown, so adding, editing or deleting a drink always updates them.

### Changed
- A drink in the log is its start time, amount and alcohol %. Its end time is always calculated from those (whole minutes, for example 175 ml at 13.5 % = 47 min), never stored.
- The countdown is read from the log in order. A drink that is unfinished when the next one is logged adds the time it had left at that moment after the `+` (a drink already finished adds nothing). The last drink is the current countdown. The `+` holds while a drink is active and counts down only when none is: between drinks and after the last one finishes.
- Drink durations are rounded to whole minutes (the smallest drink, 25 ml at 1 %, now lasts 1 minute instead of 30 seconds).
- BAC absorption uses each drink's full calculated duration.
- Builds on the Even Hub SDK 0.0.16 / CLI 0.2.0 / Vitest 5 update from 1.5.14; still requires Even App 2.2.10 or later.

### Fixed
- Editing a drink's amount or alcohol % now changes the countdown straight away (before, a stored planned end kept the old value).
- Deleting a drink removes everything it added to the countdown.
- The countdown no longer shows a wrong or stale `+` figure after edits or deletes.

### Removed
- The **End time** field in the phone's Edit drink form: the end is calculated from the drink.
- Stored end times and planned end times in saved data. Older saves still load; those fields are ignored.

## [1.6.3] - 2026-11-09

### Changed
- The phone's event log (title and box) is hidden. It is controlled by `SHOW_EVENT_LOG` in `src/main.ts`; set it to `true` to show the log. Events are still recorded.

### Added
- Phone footer showing the app version (for example `Bacpacer v1.6.3`), in small print that meets WCAG AA contrast.

## [1.6.2] - 2026-11-09

### Changed
- The countdown (current timer and carry-over) is now worked out from the drink log every time it is shown, instead of being kept as a running total. Adding, editing or deleting a drink updates the countdown, the BAC estimate, peak and time to peak from the same log.
- The carry-over counts down smoothly instead of in whole-minute steps.

### Fixed
- Carry-over left over from a deleted drink no longer stays on the counter.
- Editing a drink's end time updates the carry-over to match.

## [1.6.1] - 2026-11-08

### Fixed
- Deleting a drink from the phone now removes the carry-over time it created. Previously, logging a second drink while the first was still running and then deleting the first left its time on the counter (for example `47 +35` stayed after deleting).
- Editing a drink's end time from the phone now updates the carry-over to match. Previously the counter kept the old carry-over.

## [1.6.0] - 2026-11-08

### Added
- Log a drink from the phone: new **Log a Drink** button opens a pop-up with ml and % fields, each with -/+ buttons (25 ml / 0.5 % steps, same as the glasses). It opens with the current default drink; logging makes the entered values the new default and switches the glasses to Stand by.
- Load a preset from the phone: tap a preset row in **Presets** and confirm "Load this preset?" to make it the default drink on the phone and the glasses. Nothing is logged.
- **Presets** window shows the current default drink.

## [1.5.14] - 2026-11-08

### Fixed
- Countdown and BAC display no longer stop refreshing after the glasses system menu (tap, then long-press) is opened and closed. The menu fires foreground enter/exit events while Bacpacer stays on screen; these are now told apart from a real switch to another app.

### Changed
- Updated to Even Hub SDK 0.0.16, CLI 0.2.0 and Vitest 5. Requires Even App 2.2.10 or later.
- `app.json` now declares `min_sdk_version` 0.0.16 and `min_app_version` 2.2.10; `npm run pack` passes `--sdk-ver 0.0.16`.
- Added the Even Hub simulator as a dev dependency.

## [1.5.13] - 2026-07-26

### Fixed
- Prevented fully consumed standby carry-over from reappearing as `+ 1` when logging a new drink afterward.
- Keep standby carry-over source-of-truth in persisted carry state after migration, instead of re-deriving from historical interrupted entries during normal countdown reads.

## [1.5.12] - 2026-07-26

### Fixed
- Standby carry-over now starts counting down immediately when active drink time reaches zero, instead of staying static.
- Logging a new drink while carry-over is counting down now preserves the current carry-over remainder and displays it alongside the new active timer.
- Carry-over countdown progress is now persisted at minute boundaries so crashes/reloads resume with the correct remaining `+` time.

## [1.5.11] - 2026-07-26

### Fixed
- Enforced a minimum drink strength of `1%` across drink logging and persistence.
- Decreasing `%` on glasses no longer goes below `1%`.
- Presets now clamp alcohol percentage to `1%` minimum when added or updated.

## [1.5.10] - 2026-07-26

### Fixed
- Corrected ABV normalization so `1` is interpreted as `1%` (not `100%`) when estimating next-drink timing.
- Fixed incorrect long wait times for small low-ABV drinks (for example `25 ml @ 1%`).

## [1.5.7] - 2026-07-24

### Added
- Reused the bottom-left HUD slot to show `Peak BAC X.XXX at HH:MM` on every screen while BAC is still rising

## [1.5.6] - 2026-07-24

### Fixed
- Replaced emoji-style trend arrows with plain arrow glyphs so LVGL no longer receives U+FE0F (variation selector) and logs missing-glyph warnings.

## [1.5.5] - 2026-07-24

### Fixed
- Added explicit `textContainerUpgrade` success checks in the renderer and automatic recovery when an upgrade fails
- Failed text upgrades now mark layout state stale so the next render recreates the page cleanly instead of continuing to send invalid upgrade calls
- Added `contentOffset: 0` and `contentLength: 0` on full text replacements to match SDK guidance

## [1.5.4] - 2026-07-20

### Fixed
- Added a missing `clearBridge()` so a stale bridge reference could no longer be reused after a disconnect
- Debounced persisted-state writes (400ms) instead of firing a bridge write on every change, with a `flushPersistedState()` that writes immediately on lifecycle boundaries (backgrounding, teardown) so no state is lost
- Cleared any pending debounced write whenever a new bridge is assigned, preventing a stale write from leaking across a reconnect
- Serialized all BLE bridge calls (renders and local storage reads/writes) through a shared queue with per-call timeouts to prevent concurrent bridge operations from corrupting state or hanging
- Made bridge listener cleanup defer `unsubscribe()` calls to avoid a race where a listener unsubscribes itself mid-callback

## [1.5.3] - 2026-07-19

### Changed
- Removed automatic bridge reconnect/relaunch after abnormal/system exits, BLE disconnects, and repeated render failures
- Disconnect and initialization-failure states now remain stopped until the user manually taps Connect again

## [1.5.2] - 2026-07-18

### Fixed
- Prevented auto-reconnect after a user-confirmed exit from the root menu exit dialog
- Kept reconnect behavior for genuine disconnect/system failure exits

## [1.5.1] - 2026-07-18

### Fixed
- Glasses-side preset taps now correctly load the selected preset and open the `Log a drink` submenu

## [1.5.0] - 2026-07-18

### Added
- Glasses-side `Presets` main menu option
- `Load preset` screen on glasses with clickable preset list synced from phone-side saved presets

## [1.4.0] - 2026-07-18

### Added
- Phone-side preset management for common drink sizes and alcohol percentages
- Presets modal with add, edit, and delete support

## [1.3.0] - 2026-07-18

### Added
- Background state persistence: app state (drink log, BAC settings, active screen) now survives the phone's background/headless WebView migration instead of resetting
- Automatic reconnection: the app now retries the bridge connection after abnormal exits, device disconnects, or repeated render failures
- Device status monitoring via `onDeviceStatusChanged` to detect BLE disconnects that the event stream misses
- `pageshow` and `visibilitychange` listeners to resynchronize display state when the WebView becomes visible again

### Changed
- Bridge event handling and app initialization are now wrapped in error guards so a single malformed event or failed init no longer silently kills the connection
- The display refresh timer now tolerates individual tick failures without stopping future refreshes

### Fixed
- Connection could get stuck marked "connected" after a failed initialization
- Refresh timer would not resume after certain disconnect/reconnect sequences

## [1.2.8] - 2026-05-05

### Added
- Metabolism speed setting (very slow → very fast)
- Sober-time estimate in BAC settings view
- Downward trend arrow when BAC is falling
- Date-of-birth input (replaces manual age field)
- Unit test suite

### Changed
- Display refresh is now more efficient: only re-renders when content is likely to have changed
- Improved BAC settings layout and field ordering

### Fixed
- Stale drink log entries corrupting BAC estimate
- Scroll behaviour in BAC settings

## [1.2.1] - 2026-05-02

### Added
- Current BAC shown in stand-by view
- Stand-by HUD toggle (tap to show/hide detail)
- End time recorded for each drink entry

### Changed
- Renamed "Home" to "Stand by" throughout
- Improved time editor
- Tidied main menu and Summary screen layout

### Fixed
- BAC calculation errors

## [1.2.0] - 2026-05-02

### Added
- First BAC estimate implementation: tracks current BAC, peak BAC, and estimated sober time

### Fixed
- Timer rendering

## [1.1.0] - 2026-05-01

### Added
- Drink log in phone companion UI with edit and delete per entry
- Reset moved to phone UI

### Changed
- Logging a drink now returns directly to Stand by
- Countdown moved to right side of display

### Fixed
- Dialog always opening on launch

## [1.0.2] - 2026-04-30

### Fixed
- Persistent storage not saving correctly
- Connection stability issues

## [1.0.1] - 2026-04-21

### Added
- Initial release
- Menu with Stand by, Log a drink, and Summary
- Drink logging with adjustable volume and strength
- Drink history with countdown to next drink window
