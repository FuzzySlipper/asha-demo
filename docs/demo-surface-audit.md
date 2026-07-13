# Demo Surface Audit

Status: current as of ASHA tasks #5293 and #5734.

This is a lightweight audit of product-surface stubs and half implementations.
It is not a broad claims framework; it exists so unfinished pieces do not become
quiet load-bearing structure.

| Item checked | Disposition | Owner task |
|---|---|---|
| Retired broad-claims document references | No live references found in repo search. | none |
| Static target dummy content | Removed from `catalogs/actors`; the demo now loads `demo-player.entity.json` and `generated-tunnel-enemy.entity.json`. | #4217 |
| Flat-room scene naming | Replaced with `levels/scenes/generated-tunnel-room.scene.json`. | #4217 |
| Pause/options/exit controls | Typed HUD menu intents drive pause/resume/restart, real browser-input tuning, and a title state that starts a fresh RuntimeSession. | #4897 |
| Local Three.js/rendering implementation risk | Demo imports `@asha/renderer-host`; the Three.js backend remains transitive ASHA host plumbing rather than a demo dependency or app import. | #4386 |
| Local health/combat/lifecycle authority risk | Fire, health, death, and restart use `RuntimeSession` readouts/intents; demo UI projects state. | #4224/#4217 |
| Proof-page artifacts appearing as product UI | No proof dashboard is mounted. Live smoke and screenshots stay in `tests/` and `artifacts/`. | none |
| Player health, enemy attack, death/restart loop | Implemented through RuntimeSession readouts/intents and live UI smoke coverage. | #4219/#4485 |
| Polished pause/options/menu flow | Basic typed pause/options/exit flow is present and projected through public `@asha/ui-dom` game HUD/menu primitives. | #4522/#4842 |
| Studio open/attach/control product path | Not implemented in `asha-demo`; belongs to Studio workflow. | #4221 |
| Compiled standalone host | Demo-owned host bootstrap and `npm run standalone` native provider smoke exist. The smoke uses the built UI/content and no manually selected dev-server port. | #4521/#4841 |
| Replay/telemetry evidence | `replays/generated-tunnel-playable-loop.json` is regenerated from public RuntimeSession telemetry/readouts and covers movement, player death, restart, and enemy defeat. | #4898 |
| Animated mesh playback proof | The demo loads a committed, hash-pinned Kenney GLB through the public renderer-host manifest, applies the public RuntimeSession animation intent, and displays renderer playback readback for the selected `run` clip. | #5293 |
| Gameplay extension drift | The close-range bonus and persistent challenge now share one statically composed native RuntimeSession provider; the former hook manifest, second gameplay host, event ferry, and shadow session are removed. | #5734 |

The animated mesh row proves asset loading, named clip selection, and renderer
playback projection. It does not claim that the renderer owns gameplay outcome,
mixer authority, collision, or replay history; those remain explicit upstream
non-claims.
