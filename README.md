# Bacpacer (Even G2)

Bacpacer is an Even G2 app for pacing alcohol intake.

It lets you log drinks on-glasses, shows a countdown until the next drink window, and estimates BAC using configurable personal settings.

## What This App Does

- Main menu on glasses:
  - `Stand by`: minimal standby detail view
  - `Log a drink`: open drink logging submenu
  - `Summary`: show BAC summary metrics
  - `Presets`: open a clickable list of presets synced from the phone
- Drink logging flow:
  - adjust default volume (`ml`) and strength (`%`)
  - load a saved preset on glasses to replace the current default volume and strength
  - confirm `Add drink` to store an entry
  - each entry has start and computed end time
  - if a new drink is logged before the previous one finishes, the interrupted remainder is carried forward in the glasses HUD instead of being lost
  - once active countdown reaches zero, remaining carry-over is still shown with a leading plus (for example `+ 12`)
- BAC estimate model:
  - tracks current BAC and peak BAC
  - shows trend arrows (rising `↗`, falling `↘`) in BAC displays
  - shows `Peak BAC X.XXX at HH:MM` in the bottom-left HUD while BAC is still rising
  - estimates sober time
  - supports food profile, metabolism slider, and profile inputs
- Companion web UI:
  - connect to bridge
  - view event log
  - reset all drinks
  - open/edit/delete drink entries
  - tune BAC settings
  - manage saved presets for common `ml` + `%` combinations

## Tech Stack

- Vite + TypeScript
- Even Hub SDK: `@evenrealities/even_hub_sdk`
- Even Hub CLI for QR, simulator, and packaging

## Project Scripts

- `npm run dev`: start local dev server on `0.0.0.0:5173`
- `npm run qr`: show Even Hub QR target for the dev server
- `npm run simulator`: launch Even Hub simulator against local dev server
- `npm run build`: production build to `dist/`
- `npm run preview`: preview production build locally
- `npm run pack`: build and create `bacpacer.ehpk`
- `npm run test`: run unit tests once (Vitest)
- `npm run test:watch`: run unit tests in watch mode

## Local Development

1. Install dependencies:
	- Windows PowerShell in this environment: `npm.cmd install`
	- Other shells: `npm install`
2. Start dev server:
	- `npm.cmd run dev` (PowerShell) or `npm run dev`
3. In another terminal, show QR:
	- `npm.cmd run qr` (PowerShell) or `npm run qr`
4. Scan QR from Even Hub to run on device.

## Run in Simulator

1. Start dev server:
	- `npm.cmd run dev` (PowerShell) or `npm run dev`
2. Start simulator:
	- `npm.cmd run simulator` (PowerShell) or `npm run simulator`

## Package for Distribution

1. Build and package:
	- `npm.cmd run pack` (PowerShell) or `npm run pack`
2. Output artifact:
	- `bacpacer.ehpk`

## Configuration and Metadata

- App metadata and package info: `app.json`
- Package id: `com.er.bacpacer`
- SDK minimum: `0.0.10`

## Notes

- Persisted state key: `bacpacer.persisted.v1`
- Drink history and saved presets are persisted via bridge storage (with browser localStorage fallback).
- The top-right standby countdown is reconstructed from the persisted drink log, including carry-over from interrupted drinks, so reconnects or crashes do not reset the remaining time debt.

## Stability & Connection Resilience

- **Background state persistence**: on phone background/headless WebView migration, active app state (current screen, drink log, BAC settings) is exported via `setBackgroundState`/`onBackgroundRestore` (see `_shared/background-state.ts`) so the app resumes where it left off instead of resetting.
- **Error-guarded event handling**: the SDK event listener and app initialization are wrapped in try/catch so a single bad event or failed init can't silently kill the connection.
- **Manual reconnect behavior**: disconnects, abnormal/system exits, and repeated render failures now stop the session and require an explicit Connect action from the user.
- **Intentional exit handling**: when the user confirms exit from the root menu dialog, the app stays exited and does not auto-relaunch.
- **Page visibility handling**: `pageshow` and `visibilitychange` listeners resynchronize the refresh timer and display when the WebView becomes visible again, in addition to the SDK's own foreground/background events.
- **Bridge call serialization**: all BLE bridge calls (renders and local storage reads/writes) are serialized through a shared queue (`_shared/bridge-serializer.ts`) with per-call timeouts, preventing concurrent bridge operations from hanging or corrupting state.
- **Text-upgrade self-healing**: if a `textContainerUpgrade` call fails (for example after a stale page/session transition), the renderer marks layout state stale and recreates the page on the next render pass instead of repeatedly sending failing upgrades.
- **Debounced persistence**: `savePersistedState()` debounces bridge writes (400ms); `flushPersistedState()` writes immediately at lifecycle boundaries (backgrounding, teardown) so no state is lost. `clearBridge()` clears any pending debounced write when the bridge changes (e.g. on reconnect).

