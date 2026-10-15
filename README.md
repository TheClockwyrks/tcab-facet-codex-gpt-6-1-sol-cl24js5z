# Facet

A browser puzzle about pressure, fractures, and satisfying chain reactions. Swap neighboring stones into lines of three. Clears strain the stones around them; flawed stones join a touching clear for double points. Earn brilliants, stars, and prisms to open up the board. Reach each level's target and keep playing until no productive swap remains.

## Run

Requires Node.js 22 or later and npm.

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run preview
```

The production site is entirely self-contained in `dist/`. Serve it from any static host, at its root or under a subdirectory. No backend, credentials, or external runtime requests are needed.

## Controls

- Mouse, pen, or touch: press a stone, drag onto a neighbor, and release. Alternatively, press and release one stone, then press and release its neighbor. Drag back to the original stone to withdraw the offer.
- Arrow keys: choose a menu item. Enter or Space: accept.
- P or Escape: pause and resume. Escape also leaves the instructions and game-over screen.
- M: mute music and sound. Every menu also has large pointer targets.
- Backquote: the engine's diagnostic overlay.

## Development and verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The simulation is a set of immutable transitions, separate from drawing. Tests exercise it directly and through the Simple 2D engine using a native canvas and a counted clock. The engine owns input, asset loading, audio, viewport fitting, recording, and diagnostics. The required debug poses and snapshot are available through `engine.debug` on any engine created with the exported `game`; no debug globals are installed on the page.

## Original assets

`public/assets/` contains the finished, committed assets: 32 strain-specific stones, two cut overlays, a board surround, seven six-frame breaks, an eight-frame prism turn, four live particle systems, eight event sounds, an eight-tone chain ladder, a sampled glass shatter, and two original music loops with MIDI scores. Sprites use seven distinct silhouettes and faceted pixel patterns. Sound combines synthesized struck tones with a glass debris layer. The themes use music box and vibraphone voices.

`tools/produce.py` documents the one-time authoring with `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`. These authoring tools are **not build dependencies**. Building only bundles the committed assets. `tools/capture.mjs` captures a live engine replay from the development server. The player-facing presentation and captured media are in `showcase/`.
