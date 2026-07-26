# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
