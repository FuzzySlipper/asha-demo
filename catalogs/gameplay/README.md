# Gameplay Catalog

`catalog.json` records the Demo's selected upstream FPS gameplay preset and its
typed provider configuration. `security-door.behavior.json` is the canonical
ProjectContent form compiled from `src/content/security-door.ts` by the public
`@asha/game-workspace` helpers. Rust admits and privately compiles that data;
the browser does not execute the source or assemble a Gameplay Module for it.
