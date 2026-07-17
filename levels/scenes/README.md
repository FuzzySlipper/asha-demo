# Scene Documents

`generated-tunnel-room.scene.json` is the canonical schema-v3 `SceneDocument`
opened by Studio and decoded by Rust for each fresh Demo RuntimeSession. Its
ordinary entity-instance nodes place the player and enemy by EntityDefinition
id, while its bootstrap node binds the generator preset/seed and project
catalogs. Runtime movement never writes back into this stored document.
