# ASHA Demo

Human-facing demonstrations of ASHA capabilities.

This repository is intentionally separate from `asha-testing`, which owns synthetic proof harnesses, boundary checks, and evidence workflows. Code here should optimize for clear, deliverable demonstrations built on public ASHA surfaces.

## Starting posture

Start with the product README and runnable demo experience first. Add proof or evidence harnesses later only when they support the human-facing demo, and keep them secondary to the product flow.

Use the engine-owned public surface manifest in `/home/dev/asha-engine/harness/public-surface/ts-packages.json` to decide which ASHA packages are approved for this repo. If a demo needs a missing engine capability, request or add that public surface in ASHA instead of copying `asha-testing` internals or proof scaffolding.

## Fresh setup

Clone beside the engine repo:

```sh
cd /home/dev
git clone git@github.com:FuzzySlipper/asha-engine.git asha-engine
git clone git@github.com:FuzzySlipper/asha-demo.git asha-demo
cd asha-demo
npm install
```

The local package links in `package.json` expect `../asha-engine`. The package
scope remains `@asha/*`.

## Verification

```sh
npm run check:dependencies
npm run check:architecture
npm run check:demo-rs
npm run check:gameplay-module
npm run check:host
npm run check:standalone
npm test
npm run build
```

For interactive browser evidence, run `npm run dev -- --port 5173` or let the
Den Playwright broker provide the host and port. The default browser host binds
to `0.0.0.0` and installs the public native Rust RuntimeBridge provider before
app boot.

## Demo Surface

This repo contains the first ASHA Game Project demo surface:

- `asha.game.toml` declares the bounded workspace shape.
- `project/project-bundle.json` declares the demo ProjectBundle, runtime request,
  durable source file refs, generated gameplay-module bindings/configuration,
  and the close-range trigger definition.
- `catalogs/actors/`, `catalogs/gameplay/`, `catalogs/materials/`, `catalogs/spawns/`, and `catalogs/weapons/` hold inspectable demo content.
- `levels/presets/`, `levels/scenes/`, `assets/`, and `replays/` are source roots for demo-owned content and evidence.
- `policies/` is documentation-only until ASHA exposes an approved public policy-authoring surface.
- The served UI consumes public ASHA package roots for the integrated RuntimeSession loop: first-person generated-tunnel room rendering from the public renderer projection, browser-operable movement/look controls with collision readout, deterministic generated tunnel projection, enemy placement from durable ECRP content, hash-pinned animated mesh playback from RuntimeSession animation intent, primary-fire health/HUD feedback, typed HUD/menu controls, death status, and typed restart receipt. Runtime authority requires an injected public native Rust RuntimeBridge provider (`asha.runtime_bridge.native_rust_provider.v1`, with the current `asha_demo.native_runtime_bridge_provider.v1` alias still accepted); a plain static browser session fails closed with a visible missing-backend diagnostic instead of using reference authority.
- The same provider carries a product-owned `GameplayRuntimeHostTransport`.
  `demo-rs/crates/gameplay-host-native` statically links the real
  `demo.primary-fire-effect` module through approved public Rust facades. Accepted
  camera movement drives the authored tunnel trigger, accepted weapon outcomes
  become standard combat/lifecycle events, and the visible challenge HUD projects
  the module's persistent state/reaction evidence.

Run `npm run check:dependencies` before adding code or package dependencies. The guard reads ASHA's public-surface manifest and rejects private ASHA packages, generated contract file paths, Rust crate paths, and package-internal `src/*` imports.

Run `npm run check:architecture` before moving source boundaries. It rejects
bloated `src/app.ts`, handwritten app/source JavaScript, private ASHA imports,
renderer backend imports, and modules that mix RuntimeSession calls with direct
DOM projection mutation.

Run `npm run check:demo-rs` before changing demo-owned Rust tooling or the game
manifest. It compiles the downstream Rust preflight crate and checks stable
demo-owned content metadata without importing ASHA internals.

Run `npm run check:gameplay-module` before changing the close-range challenge.
It executes the public gameplay-module conformance kit against the real linked
provider and authored binding registry, including frozen reads, state facts,
verification replay, recorded-fact playback, and save/reload. Its machine-readable
report is `artifacts/5636/gameplay-module-conformance.json`.

Run `npm run check:host` before changing host manifests. It verifies browser and
standalone host configs use the same ProjectBundle/content path and native
RuntimeBridge provider contract without reference fallback.

Run `npm run standalone` before changing packaged-host behavior. It builds the
same UI/content bundle, installs the public native RuntimeBridge provider from
host bootstrap, loads RuntimeSession content without a manually selected
dev-server port, and writes `dist/standalone/status.json`.

Run `npm run capture:replay` after a build to refresh the committed
generated-tunnel replay evidence under `replays/`. It consumes public
RuntimeSession telemetry/replay readouts for movement, player death/restart,
and primary-fire enemy defeat; it does not implement replay authority locally.

Run `npm run test:live-ui` only with `BASE_URL` or `PLAYWRIGHT_BROKER_BASE_URL` set by the Den Playwright broker or an equivalent local dev-server wrapper. The live UI smoke checks objective text/readout values and writes screenshots under `PLAYWRIGHT_BROKER_ARTIFACT_ROOT` when provided.

## Source Layout

This repo follows ASHA's game-agent source organization guide:
`../asha-engine/docs/game-agent-code-organization.md`.

- `src/app.ts` is an entrypoint only. It imports `bootGame()`, calls it, and
  reports fatal startup errors.
- `src/bootstrap/` composes the demo, mounts adapters, wires browser events, and
  starts the frame loop. It should not become a declaration pile or gameplay
  authority module.
- `src/content/` loads authored ProjectBundle/ECRP/catalog files and performs
  consumer-side preflight/readout shaping.
- `src/runtime/` is the ASHA runtime gateway. Direct RuntimeSession/native
  provider calls belong here, not in HUD, shell, or feature projection code.
- `src/input/` maps local controls to typed intents such as `HudMenuIntent`.
- `src/projection/` builds non-authoritative HUD/menu/readout descriptors from
  RuntimeSession projections plus shell state.
- `src/shell/` owns DOM lookup, DOM mutation, reticle updates, and browser host
  rendering adapters.
- `demo-rs/` owns demo-specific Rust tooling and the statically linked product
  gameplay module/binding cell. Generic authority remains in public engine
  facades; the demo module owns only its close-range challenge state and reactions.
- `host/` describes browser-served and standalone host shapes.

Add new game content under `catalogs/`, `levels/`, `assets/`, or `project/`.
Add new HUD/readout shape under `src/projection/`, DOM rendering under
`src/shell/`, control mapping under `src/input/`, and RuntimeSession calls under
`src/runtime/`. Feature-specific assembly should move under `src/features/`
when a feature grows past the current generated-tunnel loop.

## Authority Split

ASHA Rust decides accepted state. `asha-demo` TypeScript describes content,
collects browser input, projects HUD/menu/readouts, and submits typed intents.
Demo code must not own:

- RuntimeSession authority;
- generic collision, combat, health/lifecycle, pathfinding, replay, or restart
  authority;
- renderer backend authority or direct Three.js wiring;
- generated ASHA contract truth or private engine/package internals;
- reference/mock RuntimeSession as product authority.

Demo-owned Rust follows
`../asha-engine/docs/gameplay-runtime-host.md`: it contributes a closed static
module composition and typed module-local state, while engine owners retain
collision, combat, lifecycle, capability mutation, trigger reconciliation,
replay, scheduling, and RuntimeSession validation. The ProjectBundle declares
the closed scheduler owner/event/proposal contracts; TypeScript forwards only
typed scheduler moments and projects the bounded readout.

## Current Boundaries

This is a public-surface playable loop, not a full native FPS host. Runtime
authority, collision, combat, health/lifecycle, generation, policy, and render
projection stay in public ASHA surfaces. The demo repo owns authored project
files, browser mounting, HUD placement, and the human-facing playable page. The
demo does not use reference/mock RuntimeSession authority as its product path.

Browser-served native-provider mode is runnable through `npm run dev` or the Den
Playwright broker. Static no-provider diagnostics are still available through
`npm run dev:static` for fail-closed coverage. Standalone compiled mode is
checked through `npm run standalone` and described in
`docs/host-architecture.md`. Do not regress standalone into a shortcut to a
manually managed localhost port.

Known unfinished demo pieces are tracked in `docs/demo-surface-audit.md` and Den
tasks. Do not recreate a broad disclaimer document; remove, implement, or assign
placeholders when they appear.

## Live UI evidence

Run `npm run dev -- --port 5173` to serve the public ASHA demo UI through
`@asha/browser-host`. That host injects the native Rust RuntimeBridge provider
before app boot, so human browser play should report `rust_authority`. Run
`npm run dev:static -- --port 5173` only when intentionally checking the
fail-closed no-provider diagnostic path. `asha-demo` is opted into the Den
Playwright broker via `.den-playwright.json`; see `docs/playwright-broker.md`
for the command shape, required `BASE_URL`/`PLAYWRIGHT_BROKER_BASE_URL`
behavior, and evidence expectations.
