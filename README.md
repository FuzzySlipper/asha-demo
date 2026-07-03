# ASHA Demo

Human-facing demonstrations of ASHA capabilities.

This repository is intentionally separate from `asha-testing`, which owns synthetic proof harnesses, boundary checks, and evidence workflows. Code here should optimize for clear, deliverable demonstrations built on public ASHA surfaces.

## Starting posture

Start with the product README and runnable demo experience first. Add proof or evidence harnesses later only when they support the human-facing demo, and keep them secondary to the product flow.

Use the engine-owned public surface manifest in `/home/dev/asha/harness/public-surface/ts-packages.json` to decide which ASHA packages are approved for this repo. If a demo needs a missing engine capability, request or add that public surface in ASHA instead of copying `asha-testing` internals or proof scaffolding.

## Project skeleton

This repo now contains the first ASHA Game Project skeleton:

- `asha.game.toml` declares the bounded workspace shape.
- `catalogs/actors/`, `catalogs/materials/`, and `catalogs/weapons/` are game-content placeholders.
- `levels/presets/`, `assets/`, and `replays/` are source roots for future demo-owned content and evidence.
- `policies/` is documentation-only until ASHA exposes an approved public policy-authoring surface.

Run `npm run check:dependencies` before adding code or package dependencies. The guard reads ASHA's public-surface manifest and rejects private ASHA packages, generated contract file paths, Rust crate paths, and package-internal `src/*` imports.

## Current non-claims

This is not yet a playable FPS and does not claim shooting, enemies, death/restart, procedural generation, collision/pathfinding authority, Studio live integration, or a human-facing renderer. Passing `asha-testing` synthetic proof does not equal `asha-demo` acceptance; demo claims need human-operable UI and browser-visible evidence.

See `docs/no-claims.md` for the full current non-claim list.

## Live UI evidence

`asha-demo` is not yet opted into the Den Playwright broker because it has no served browser UI. See `docs/playwright-broker.md` for the future command shape, required `BASE_URL`/`PLAYWRIGHT_BROKER_BASE_URL` behavior, and evidence expectations.
