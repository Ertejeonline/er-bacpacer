# Bacpacer (Even G2)

Alcohol pacing app: log drinks on the glasses, see a countdown to the next drink window, estimate BAC. Version 1.6.0, package `com.er.bacpacer`, author Ertehe. Repo: https://github.com/Ertejeonline/er-bacpacer

Read `../CLAUDE.md` for shared G2 rules. Full feature list is in `README.md`; release notes in `CHANGELOG.md`.

## Layout
- `g2/` - glasses app: `main.ts`, `app.ts`, `renderer.ts` (display), `events.ts` (input), `state.ts`, `index.ts`
- `src/` - phone companion UI (`main.ts`, `styles.css`): connect, event log, edit drinks, BAC settings, presets
- `_shared/` - `app-types.ts`, `bridge-serializer.ts`, `background-state.ts`, `log.ts`
- `tests/g2`, `tests/shared` - Vitest tests

## Commands
- Windows PowerShell: use `npm.cmd` instead of `npm`.
- `npm install`, `npm run dev`, `npm run simulator`, `npm run test`, `npm run pack` (outputs `bacpacer.ehpk`)
- `npm run qr` has the LAN IP `192.168.1.45` hardcoded in package.json. Update it if your machine's IP changes.

## App-specific rules
- Menu: Stand by, Log a drink, Summary, Presets.
- Interrupted drink remainders are carried over (format like `42 +8`). Keep that behavior when changing timer code.
- Presets sync from the phone to the glasses.
- Bump `version` in both `package.json` and `app.json` for each release, and add a CHANGELOG entry.
- Tests live in `tests/g2/` (renderer, state) and `tests/shared/` (serializer). Run `npm run test` after changing them.
