# Demo Surface Audit

Status: current as of ASHA task #4487.

This is a lightweight audit of product-surface stubs and half implementations.
It is not a broad claims framework; it exists so unfinished pieces do not become
quiet load-bearing structure.

| Item checked | Disposition | Owner task |
|---|---|---|
| Retired broad-claims document references | No live references found in repo search. | none |
| Static target dummy content | Removed from `catalogs/actors`; the demo now loads `demo-player.entity.json` and `generated-tunnel-enemy.entity.json`. | #4217 |
| Flat-room scene naming | Replaced with `levels/scenes/generated-tunnel-room.scene.json`. | #4217 |
| Pause/options/exit controls | Present as typed HUD menu intents and DOM projection descriptors. Options/exit are intentionally read-only/paused demo states. | #4485 |
| Local Three.js/rendering implementation risk | Demo imports `@asha/renderer-host`; the Three.js backend remains transitive ASHA host plumbing rather than a demo dependency or app import. | #4386 |
| Local health/combat/lifecycle authority risk | Fire, health, death, and restart use `RuntimeSession` readouts/intents; demo UI projects state. | #4224/#4217 |
| Proof-page artifacts appearing as product UI | No proof dashboard is mounted. Live smoke and screenshots stay in `tests/` and `artifacts/`. | none |
| Player health, enemy attack, death/restart loop | Implemented through RuntimeSession readouts/intents and live UI smoke coverage. | #4219/#4485 |
| Polished pause/options/menu flow | Basic typed pause/options/exit flow is present; richer game-HUD public primitives are planned upstream. | #4522 |
| Studio open/attach/control product path | Not implemented in `asha-demo`; belongs to Studio workflow. | #4221 |
| Compiled standalone host | Planned host manifest exists, but no compiled standalone app is claimed yet. | #4521 |
