# ASHA Demo

`asha-demo` is a human-facing ASHA Game Project. Its acceptance oracle is the
playable browser experience: the native host must start, the world must be
visible, and player controls must visibly change projected game state.

Synthetic conformance belongs in `asha-testing`. This repository does not keep
evidence catalogs, committed test reports, proof panels, reference-authority
fallbacks, or private test globals.

## Setup and run

Clone beside `asha-engine`, then:

```bash
npm install
npm run dev -- --port 5173
```

The development host installs the public native Rust RuntimeBridge provider
before booting the game. Missing runtime authority is a startup/product failure;
the Game Project does not fall back to reference authority.

Start the encounter, move with WASD, aim with the mouse, and fire with the
primary mouse button. When the contextual security-switch prompt appears,
press `E`. The switch and door are stored project content: Rust resolves the
nearby prefab part, executes the authored behavior, projects the raised door,
and closes it again through scheduled authority once the doorway is clear.

## Verification

```bash
npm test
npm run build
BASE_URL=http://127.0.0.1:5173 npm run test:live-ui
```

`npm test` runs local dependency, authority-boundary, content, Rust provider,
host, and build checks. `test:live-ui` uses visible DOM/browser behavior: it
proves the title state takes no damage before Start, observes Fire, freezes
health while paused, and verifies the declared `KeyR` action restores health
and combat state. A no-op Fire control fails even if manifests and diagnostic
hashes still exist.

Playwright output is ephemeral under ignored result/artifact directories. Exact
engine and Demo revisions belong in the CI or Den review record, not a
refresh-only committed report.

## Repository boundary

- TypeScript consumes approved public ASHA package roots and projects browser
UI and compiles immutable authored-behavior data; it does not own simulation
authority.
- `demo-rs/crates/primary-fire-effect` owns only the Demo-specific gameplay
  module and its local provider regression.
- `src/content/security-door.ts` uses `@asha/game-workspace` to author a closed
  data package. `scripts/sync-authored-content.mjs` materializes its canonical
  ProjectContent JSON before build; runtime never invokes that TypeScript.
- `demo-rs/crates/native-runtime-provider` composes that module through public
  Rust facades into the native runtime cell.
- Generic collision, combat, lifecycle, replay, serialization, and render
  authority remain upstream.

The root `asha.project-bundle.json` is the sole project manifest. Add its stored
content under `catalogs/`, `levels/`, or `assets/`, author behavior source under
`src/content/`, then run `npm run sync:content` to refresh its canonical files
and manifest closure. The same root project opens in Studio and is consumed by
a fresh runtime; normal play does not generate or rewrite project source. Keep
runtime calls in `src/runtime/`, browser composition in
`src/bootstrap/`, non-authoritative view shaping in `src/projection/`, and DOM
mutation in `src/shell/`.

See [host architecture](docs/host-architecture.md), the
[Studio-authored content pipeline map](docs/studio-authored-content-pipelines.md),
the [Studio edit/save/run tutorial](docs/edit-in-studio.md),
and the [proof disposition ledger](docs/proof-disposition.md).
