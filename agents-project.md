# ASHA Demo Local Bootstrap

`asha-demo` is the human-facing demonstration repo for ASHA capabilities. It should look like a real downstream ASHA Game Project consuming public engine surfaces, not like engine internals or a synthetic validation harness.

Use Den project ID `asha` for tasks, messages, documents, librarian queries, and guidance lookups. When creating or updating Den tasks from this repo, tag them with `asha-demo` plus any feature/system tags.

## Satellite repo boundary

This is a satellite repo. Do **not** jump into `/home/dev/asha-engine` and implement upstream engine changes as part of an `asha-demo` task, even when the demo is blocked by a missing or broken ASHA surface.

If a demo needs a missing camera, rendering, runtime, asset, interaction, bridge, or contract capability:

1. Stop the local implementation at the satellite boundary.
2. Create a Den task in project `asha` for the upstream `asha-engine` change, tagged with `asha-engine` and `asha-demo`.
3. Link the upstream task from the blocked `asha-demo` task/message.
4. Mark the demo task `blocked` with blocker summary, attempted remedies, and the upstream task ID.
5. Wait for the upstream task to land before continuing. Do not recreate engine authority locally or carry a local engine patch in this repo.

## Repo role

- Human-facing demonstrations belong here.
- Synthetic proof harnesses, conformance evidence, and evidence factories belong in `asha-testing`.
- Engine/runtime/protocol/render authority belongs in `asha-engine`.
- Studio/editor UX belongs in `asha-studio`.

## Public-surface rule

Use public ASHA package roots only. If a demo needs a missing capability, request the public ASHA surface rather than recreating engine concepts locally.

Forbidden:

- no ASHA private package/crate source imports;
- no generated contract hand edits;
- no reference/mock RuntimeSession as product authority;
- no local collision/combat/health/lifecycle/pathfinding/runtime authority;
- no direct Three.js/backend wiring that bypasses the approved renderer host surface;
- no raw JSON/runtime escape hatches.

## Local commands

```bash
npm install
npm run check:dependencies
npm run check:architecture
npm run check:demo-rs
npm run check:host
npm test
npm run build
```

For live browser evidence, prefer the Den Playwright broker when available. Otherwise use the documented local dev command and record the host/port and artifacts in the Den task.
