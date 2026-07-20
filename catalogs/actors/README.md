# Actor Catalog

This directory holds the demo-owned durable `EntityDefinition` files loaded by
the served ASHA demo:

- `demo-player.entity.json`
- `generated-tunnel-enemy.entity.json`

The root canonical ProjectBundle declares these files as ProjectContent. Rust
decodes and admits the closed source set during `RuntimeSession.loadProject()`.
Runtime authority, movement, collision, combat, health, policy, and lifecycle
mutation remain upstream ASHA surfaces.
