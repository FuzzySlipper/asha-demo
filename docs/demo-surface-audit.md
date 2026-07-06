# Demo Surface Audit

Status: current as of ASHA task #4222.

This is a lightweight audit of product-surface stubs and half implementations.
It is not a broad claims framework; it exists so unfinished pieces do not become
quiet load-bearing structure.

| Item checked | Disposition | Owner task |
|---|---|---|
| Retired broad-claims document references | No live references found in repo search. | none |
| Static target dummy content | Removed from `catalogs/actors`; the demo now loads `demo-player.entity.json` and `generated-tunnel-enemy.entity.json`. | #4217 |
| Flat-room scene naming | Replaced with `levels/scenes/generated-tunnel-room.scene.json`. | #4217 |
| Inert options/exit controls | No options or exit buttons are present in the product surface. | #4220 owns future menu work |
| Local Three.js/rendering implementation risk | Demo imports `@asha/renderer-host`; the Three.js backend remains transitive ASHA host plumbing rather than a demo dependency or app import. | #4386 |
| Local health/combat/lifecycle authority risk | Fire, health, death, and restart use `RuntimeSession` readouts/intents; demo UI projects state. | #4224/#4217 |
| Proof-page artifacts appearing as product UI | No proof dashboard is mounted. Live smoke and screenshots stay in `tests/` and `artifacts/`. | none |
| Player health, enemy attack, full death loop | Not implemented in current demo surface. | #4219 |
| Polished pause/options/menu flow | Not implemented beyond lock/fire/reset controls. | #4220 |
| Studio open/attach/control product path | Not implemented in `asha-demo`; belongs to Studio workflow. | #4221 |
