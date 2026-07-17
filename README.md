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

## Verification

```bash
npm test
npm run build
BASE_URL=http://127.0.0.1:5173 npm run test:live-ui
```

`npm test` runs local dependency, authority-boundary, content, Rust provider,
host, and build checks. `test:live-ui` uses only visible DOM/browser behavior:
it requires successful startup, observes the HUD change after Fire, checks the
pause/resume controls, and verifies Reset restores the visible counters. A
no-op Fire control fails even if manifests and diagnostic hashes still exist.

Playwright output is ephemeral under ignored result/artifact directories. Exact
engine and Demo revisions belong in the CI or Den review record, not a
refresh-only committed report.

## Repository boundary

- TypeScript consumes approved public ASHA package roots and projects browser
  UI; it does not own simulation authority.
- `demo-rs/crates/primary-fire-effect` owns only the Demo-specific gameplay
  module and its local provider regression.
- `demo-rs/crates/native-runtime-provider` composes that module through public
  Rust facades into the native runtime cell.
- Generic collision, combat, lifecycle, replay, serialization, and render
  authority remain upstream.

Add authored content under `catalogs/`, `levels/`, `assets/`, `prefabs/`, or
`project/`. Keep runtime calls in `src/runtime/`, browser composition in
`src/bootstrap/`, non-authoritative view shaping in `src/projection/`, and DOM
mutation in `src/shell/`.

See [host architecture](docs/host-architecture.md), the
[Studio-authored content pipeline map](docs/studio-authored-content-pipelines.md),
and the [proof disposition ledger](docs/proof-disposition.md).
