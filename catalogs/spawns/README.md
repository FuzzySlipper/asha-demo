# Spawn Catalog

`generated-tunnel.spawns.json` records the player and enemy spawn markers used by
the scene document. Runtime placement is validated by the public RuntimeSession
ECRP load path.

The player start is intentionally offset to `z = 1.5`. With the demo player's
authored collision body, `z = 1.25` starts in the generated-tunnel obstacle's
blocked forward lane; `z = 1.5` lets the first browser movement step advance
through ASHA collision authority before later contact is reported normally.
