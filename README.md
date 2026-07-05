# ASHA Demo

Human-facing demonstrations of ASHA capabilities.

This repository is intentionally separate from `asha-testing`, which owns synthetic proof harnesses, boundary checks, and evidence workflows. Code here should optimize for clear, deliverable demonstrations built on public ASHA surfaces.

## Starting posture

Start with the product README and runnable demo experience first. Add proof or evidence harnesses later only when they support the human-facing demo, and keep them secondary to the product flow.

Use the engine-owned public surface manifest in `/home/dev/asha/harness/public-surface/ts-packages.json` to decide which ASHA packages are approved for this repo. If a demo needs a missing engine capability, request or add that public surface in ASHA instead of copying `asha-testing` internals or proof scaffolding.

## Demo Surface

This repo contains the first ASHA Game Project demo surface:

- `asha.game.toml` declares the bounded workspace shape.
- `project/project-bundle.json` declares the demo ProjectBundle, runtime request, and durable source file refs.
- `catalogs/actors/`, `catalogs/gameplay/`, `catalogs/materials/`, `catalogs/spawns/`, and `catalogs/weapons/` hold inspectable demo content.
- `levels/presets/`, `levels/scenes/`, `assets/`, and `replays/` are source roots for demo-owned content and evidence.
- `policies/` is documentation-only until ASHA exposes an approved public policy-authoring surface.
- The served UI consumes public ASHA package roots to drive an integrated reference RuntimeSession loop: first-person generated-tunnel room rendering from the public renderer projection, browser-operable movement/look controls with collision readout, deterministic generated tunnel preset/readout, enemy placement from durable ECRP content, primary-fire health/HUD feedback, typed HUD/menu controls, death status, and typed restart receipt.

Run `npm run check:dependencies` before adding code or package dependencies. The guard reads ASHA's public-surface manifest and rejects private ASHA packages, generated contract file paths, Rust crate paths, and package-internal `src/*` imports.

Run `npm run test:live-ui` only with `BASE_URL` or `PLAYWRIGHT_BROKER_BASE_URL` set by the Den Playwright broker or an equivalent local dev-server wrapper. The live UI smoke checks objective text/readout values and writes screenshots under `PLAYWRIGHT_BROKER_ARTIFACT_ROOT` when provided.

## Current Boundaries

This is a reference playable loop, not a full native FPS. Runtime authority,
collision, combat, health/lifecycle, generation, policy, and render projection
stay in public ASHA surfaces. The demo repo owns authored project files,
browser mounting, HUD placement, and the human-facing playable page.

Known unfinished demo pieces are tracked in `docs/demo-surface-audit.md` as a
small owner-task table. Do not recreate a broad disclaimer document; remove,
implement, or assign placeholders when they appear.

## Live UI evidence

Run `npm run dev -- --host 127.0.0.1 --port 5173` to serve the integrated public ASHA playable-loop UI. `asha-demo` is opted into the Den Playwright broker via `.den-playwright.json`; see `docs/playwright-broker.md` for the command shape, required `BASE_URL`/`PLAYWRIGHT_BROKER_BASE_URL` behavior, and evidence expectations.
