# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
