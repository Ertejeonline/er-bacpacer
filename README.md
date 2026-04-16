# Even G2 SDK demo

Reference app showcasing all Even G2 glasses SDK features. Companion to the [development notes](https://github.com/nickustinov/even-g2-notes).

## Screens

| Screen | What it demonstrates |
|---|---|
| **Text: basic** | Plain text container, wrapping, line breaks, scrolling |
| **Text: borders & padding** | 4 text containers with varying `borderWidth`, `borderColor`, `borderRadius`, `paddingLength` |
| **Text: Unicode & symbols** | 3 paginated screens covering all documented glyphs: arrows, box drawing, blocks, progress bars, shapes, symbols, superscripts, subscripts, fractions, Latin-1 |
| **List: basic** | 15-item scrollable list with selection highlight |
| **List: styled** | List items with Unicode symbol prefixes, border + radius styling |
| **Image: fullscreen tiled** | 2x2 grid of 288x144 images covering full 576x288 canvas (5 containers: 1 text for events + 4 images) |
| **Max containers** | 12 containers (4 image + 7 text + 1 list) testing the SDK maximum |
| **Events inspector** | Live event type display using `textContainerUpgrade` for flicker-free updates |

## Navigation

- **Tap** selects menu items or advances pages
- **Double-tap** goes back to menu (or exits the app from the root menu via `shutDownPageContainer(1)`)

## Setup

```bash
npm install
npm run dev      # start dev server
npm run qr       # generate QR for glasses pairing
npm run pack     # build and package as .ehpk
```

## Project structure

```
g2/              # glasses-side logic
  app.ts         # bridge init
  events.ts      # event dispatcher
  renderer.ts    # all demo screens, image generation
  state.ts       # screen state
  main.ts        # bridge connection
  index.ts       # app module export
src/             # web-side loader
_shared/         # shared types and logging
```

## Simulator limitations

As of `@evenrealities/evenhub-simulator` 0.7.1, the simulator rejects pages with more than 4 containers and does not support image containers larger than 200x100. The **Image: fullscreen tiled** and **Max containers** screens only work on real glasses hardware.

## Requirements

- Even Hub SDK 0.0.10+
- Node 20+
