# Proof-apparatus disposition

This is the terminal inventory for task #5859.

| Former artifact family | Disposition | Product replacement |
| --- | --- | --- |
| `artifacts/**` committed screenshots, status files, and conformance JSON | Deleted | Playwright/Den may capture ignored run artifacts; visible behavior is asserted directly |
| `demo-rs/crates/gameplay-conformance/**` and `check:gameplay-module` | Deleted | The real composed Demo module remains covered by `primary-fire-effect/tests/composed_runtime.rs` and live browser behavior |
| `scripts/capture-replay-evidence.mjs`, `replays/generated-tunnel-playable-loop.json`, and replay refresh command | Deleted | Synthetic replay behavior lives in `asha-testing`; Demo keeps runtime replay only as engine-owned product behavior |
| `scripts/print-skeleton-status.mjs` | Deleted | It relabelled source/status tokens without exercising the Game Project |
| stale `asha.game.toml` commit/review pins and `backend_proof_refs` | Deleted | Product compatibility is defined by declared package/provider contracts and real startup behavior |
| standalone persisted status and internal-hash summary | Converted | The standalone check exits on real host/composition failures and prints a small ephemeral operational readout |
| `globalThis.ashaRendererSurface` | Deleted | Live acceptance interacts with the canvas, HUD, and buttons only |
| private input-record/replay helpers in `boot-game.ts` | Deleted | Migrated contract: `asha-testing/scripts/run-public-contract-suite.mjs` exercises public input replay and replay-reuse rejection |
| presentation degradation injection and presentation-host rebuild helpers | Deleted | They existed for proof cases, not player behavior |
| telemetry-overlay proof layer and its hidden test API | Deleted | Product failures are shown through the existing HUD event status; no proof overlay remains |
| `tests/live-ui.spec.mjs` diagnostic/global assertions | Converted | Focused visible startup, Fire, pause/resume, and Reset acceptance; no-op Fire explicitly fails |
| malformed project/prefab source fixtures | Retained as local guardrails | They protect Demo-owned content ingestion and do not claim visible delivery |
| `primary-fire-effect/tests/composed_runtime.rs` | Retained as a local provider regression | Exercises Demo-specific provider behavior in its actual composed runtime cell |

No artifact was copied to `asha-testing` merely to preserve history. The useful
public input replay failure mode is runnable there before this copy is removed.
