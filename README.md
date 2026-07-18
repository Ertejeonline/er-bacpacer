# Bacpacer (Even G2)

Bacpacer is an Even G2 app for pacing alcohol intake.

It lets you log drinks on-glasses, shows a countdown until the next drink window, and estimates BAC using configurable personal settings.

## What This App Does

- Main menu on glasses:
  - `Stand by`: minimal standby detail view
  - `Log a drink`: open drink logging submenu
  - `Summary`: show BAC summary metrics
- Drink logging flow:
  - adjust default volume (`ml`) and strength (`%`)
  - confirm `Add drink` to store an entry
  - each entry has start and computed end time
- BAC estimate model:
  - tracks current BAC and peak BAC
  - shows trend arrows (rising `↗️`, falling `↘️`) in BAC displays
  - estimates sober time
  - supports food profile, metabolism slider, and profile inputs
- Companion web UI:
  - connect to bridge
  - view event log
  - reset all drinks
  - open/edit/delete drink entries
  - tune BAC settings

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
- Drink history is bounded to recent entries and persisted via bridge storage (with browser localStorage fallback).

## Stability & Connection Resilience

- **Background state persistence**: on phone background/headless WebView migration, active app state (current screen, drink log, BAC settings) is exported via `setBackgroundState`/`onBackgroundRestore` (see `_shared/background-state.ts`) so the app resumes where it left off instead of resetting.
- **Error-guarded event handling**: the SDK event listener and app initialization are wrapped in try/catch so a single bad event or failed init can't silently kill the connection.
- **Automatic reconnection**: the app listens for abnormal/system exit events, BLE device status changes (`onDeviceStatusChanged`), and repeated render failures, and automatically retries the bridge connection while the app remains in the foreground.
- **Page visibility handling**: `pageshow` and `visibilitychange` listeners resynchronize the refresh timer and display when the WebView becomes visible again, in addition to the SDK's own foreground/background events.

