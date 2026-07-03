# Actor Catalog

This directory is reserved for game-owned actor or entity definition data once the public stored `EntityDefinition` schema exists.

`static-target-dummy.json` records the static target dummy used by the public RuntimeSession combat/HUD readout. It is a demo descriptor for the visible slice, not local combat authority or a private EntityDefinition replacement.

Do not implement generic ECRP storage, runtime authority, movement, collision, combat, health, or AI behavior here.
