# Bacpacer (Even G2)

Alcohol pacing app: log drinks on the glasses, see a countdown to the next drink window, estimate BAC. Version 2.1.0, package `com.er.bacpacer`, author Ertehe. Repo: https://github.com/Ertejeonline/er-bacpacer

Read `../CLAUDE.md` for shared G2 rules. Full feature list is in `README.md`; release notes in `CHANGELOG.md`.

## Layout
- `g2/` - glasses app: `main.ts`, `app.ts`, `renderer.ts` (display), `state.ts`, `index.ts`
- `src/` - phone companion UI (`main.ts`, `styles.css`): connect, event log, edit drinks, presets, settings
- `_shared/` - `body.ts` (builds, body fat suggestion), `app-types.ts`, `bridge-serializer.ts`, `background-state.ts`, `log.ts`
- `tests/g2`, `tests/shared` - Vitest tests

## Commands
- Windows PowerShell: use `npm.cmd` instead of `npm`.
- `npm install`, `npm run dev`, `npm run simulator`, `npm run test`, `npm run pack` (outputs `bacpacer.ehpk`)
- `npm run qr` has the LAN IP `192.168.1.45` hardcoded in package.json. Update it if your machine's IP changes.

## App-specific rules
- Menu: Stand by, Log a drink, Summary, Presets.
- The drink log is the single source of truth: a drink is its start time, amount (ml) and alcohol %. Its end is always calculated (start + ml x % / 50 min), never stored. The countdown and BAC are worked out from the log every time. Going through the log in order: a drink cut short by the next one adds the time it had left at that moment to the carry-over (the figure after the `+`, like `42 +8`; a drink already finished adds nothing); the last drink is the current countdown while unfinished; the carry-over holds while a drink is active and counts down only when none is (between drinks and after the last one). Durations are whole minutes. Keep it that way: no stored end times, planned ends or running carry-over totals.
- **BAC maths = the Android app's** (owner's decision, 2.1.0): `getBacEstimateAt` is a port of `BacCalculator.estimate` in `../../Android/bacpacer/shared/src/main/kotlin/ai/ertehe/bacpacer/domain/BacCalculator.kt` (food options, Michaelis-Menten elimination, zero threshold, minute grid aligned on now, body fat from the build or the user's own figure; build list and suggestion in `_shared/body.ts`, matching Android's `Build`). Features differ between the apps on purpose; the times and BAC figures must not. When the model changes in one app, change the other too and keep the reference tests (`matches the Android app: ...` in `tests/g2/state.test.ts`) equal to Android's `BacCalculatorTest` (permille there, g/dL here).
- Presets sync from the phone to the glasses.
- Bump `version` in both `package.json` and `app.json` for each release, and add a CHANGELOG entry.
- Tests live in `tests/g2/` (renderer, state) and `tests/shared/` (serializer). Run `npm run test` after changing them.
