# Actor Catalog

This directory holds the demo-owned durable `EntityDefinition` files loaded by
the served ASHA demo:

- `demo-player.entity.json`
- `generated-tunnel-enemy.entity.json`

The browser loader reads these files and submits them to
`RuntimeSession.loadEcrpProject()`. Runtime authority, movement, collision,
combat, health, policy, and lifecycle mutation remain upstream ASHA surfaces.
