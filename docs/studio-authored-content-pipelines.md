# Studio-authored content pipelines

Status: current migration contract for Den #5945 and the #5944 campaign.

## Product rule

The Demo is a consumer of explicit content pipelines. A durable game concern must
not exist only as a TypeScript literal, a Rust bootstrap fixture, a hash mirror,
or an operation run while the game boots.

Each pipeline has four named stages:

1. a stored project source or a compiled provider artifact;
2. a Rust authority/validation owner;
3. a Studio surface that works before a `RuntimeSession` starts; and
4. a runtime consumer that does not silently reconstruct a second source of
   truth.

The decisive acceptance check is therefore: **can a user open the project in
Studio and inspect the state that the next fresh run will consume?** A runtime
receipt or a passing proof is not a substitute for that state.

Compiled behavior is still a valid source. The Demo-specific gameplay module
may own challenge semantics in Rust, and browser presentation code may own HUD
layout. Studio need not become a source-code editor. It must, however, expose
the selected provider/resource identity and all authored configuration that
changes how the compiled behavior is used.

## Environment representation decision

The generated tunnel becomes a canonical stored `VoxelVolumeAsset` referenced
by a `voxelVolume` node in the canonical `SceneDocument`.

This matches the implementation rather than adding a new level format:

- Engine's tunnel generator currently produces a `VoxelWorld`, spawn markers,
  collision data, render chunks, and generation provenance in
  `svc-levelgen`.
- Engine already has a strict `VoxelVolumeAsset` codec/validator and public
  load, edit, palette, export, and save operations.
- Studio already opens/saves canonical scenes, projects `voxelVolume` nodes,
  authors voxel assets and palettes, and authors scene lights.

The generator provider, preset, and seed remain a stored **recipe** and
provenance record. Invoking that recipe is a Studio authoring operation which
produces an inspectable candidate asset and scene change. Explicit acceptance
then saves the asset and scene. It is not a runtime bootstrap instruction.

The stored asset uses local voxel coordinates. Its `voxelVolume` scene node is
the one placement transform; generator offsets must not be copied into a
second runtime-only placement. Engine validation must either support or
explicitly reject scene transforms that cannot preserve authoritative voxel
collision semantics.

Both product projections derive from the accepted stored state:

- Rust loads the saved voxel occupancy and composes the scene-node transform to
  build collision/navigation authority.
- Rust render projection and the renderer derive voxel meshes and material
  bindings from the same asset, palette, and scene transform.

Generated render chunks, Three.js geometry, collision acceleration data, and
navigation caches are rebuildable runtime/editor projections. They are not
additional authored files. A fresh runtime must not call
`requestGeneratedTunnelOperation` or regenerate the tunnel from the recipe.

Spawn markers emitted by generation are materialized into canonical typed
scene/project records at the same acceptance boundary. Actor instances,
trigger regions, and prefab placements then refer to those stored identities.
They are not hidden fields inside the saved voxel payload.

## Classification

The map uses these labels:

- **Stored** — canonical project data or a deliberately compiled provider
  artifact.
- **Materialized** — deterministic authoring output that is previewed and
  explicitly saved; after saving it is normal Stored data.
- **Runtime** — transient authority or projection derived from Stored data and
  intentionally never written back to the project.
- **Gap** — a missing public Engine or Studio surface assigned to a #5944 child
  task.

## Source-of-truth map

| Concern | Current source or shortcut | Required source and classification | Authority and Studio surface | Runtime consumer / campaign owner |
| --- | --- | --- | --- | --- |
| Project manifest and source discovery | `project/project-bundle.json` mixes file discovery, runtime defaults, compatibility evidence, opaque module bytes, and one boot-time interaction | **Stored:** a canonical project manifest names scenes, assets, catalogs, providers, and launch defaults. Computed identities are emitted by validators/builds rather than hand-maintained | Rust strict decode/reference validation; Studio project browser and typed project settings | Runtime opens selected scene/content. #5946, #5948, then #5950 |
| Scene hierarchy and placement transforms | `levels/scenes/generated-tunnel-room.scene.json` stores only bootstrap inputs and actor nodes | **Stored:** the scene stores environment, lights, actors, prefab instances, and typed spatial gameplay nodes. A scene transform has no second catalog/definition copy | Existing Rust `SceneDocument` authority and Studio hierarchy/transform tools | Runtime bootstraps the same document. #5947, #5949, #5950 |
| Generator recipe and provenance | Bootstrap node plus `levels/presets/tiny-enclosed-tunnel.json`; the latter is mostly expected hashes | **Stored recipe** plus **Materialized output:** typed provider/preset/seed/limits and accepted output identity/provenance | Closed Rust generator registry and revision-bound candidate; Studio Generate/Preview/Accept flow | Recipe is not used by normal play. #5947 and #5949 |
| Tunnel geometry | Recreated during `createDemoRuntimeBackend` and represented to rendering by upstream `TINY_GENERATED_TUNNEL_READOUT` | **Stored:** `VoxelVolumeAsset` in project assets, referenced by a scene `voxelVolume` node | Rust voxel asset codec/authoring; Studio voxel and environment tools | Runtime voxel-world load and renderer-neutral voxel projection. #5947, #5949, #5950 |
| Collision and navigation | `requestGeneratedTunnelOperation` installs a newly generated collision world; expected hashes are mirrored in the preset | **Runtime:** derived from saved occupancy plus its scene transform. Optional caches carry source identity and are invalidated, never treated as authoring truth | Rust collision/navigation owners; Studio read-only bounds/source diagnostics | Movement, picking, path queries. #5947 and #5950 |
| Render mesh/projection | `createAshaRendererGeneratedTunnelRoomSurfaceFrame` consumes an upstream constant rather than the saved scene | **Runtime/editor projection:** mesh chunks derive from saved voxel data and palette | Rust renderer-neutral projection; ordinary Studio viewport | Renderer host consumes projections only. #5947, #5949, #5950 |
| Lights and clear/environment presentation | No light nodes; `boot-game.ts` hardcodes a clear color and relies on renderer defaults | **Stored:** light scene nodes and typed scene/environment settings | Existing Rust scene-light authority; existing Studio light tools, extended only where project settings are missing | Renderer host consumes scene projection. #5949 and #5950 |
| Materials and voxel palette | `catalogs/materials/generated-tunnel.materials.json` names roles but not the full material truth | **Stored:** generic material assets/catalog entries; voxel material ids bind through the `VoxelVolumeAsset` palette | Rust asset/catalog/palette validation; Studio material and voxel-palette inspectors | Renderer resolves material assets from projected ids. #5946, #5948, #5949, #5950 |
| Entity definitions | Two actor JSON files are stored, but console definitions exist only as allowed string ids | **Stored:** every referenced actor/console definition is a canonical typed `EntityDefinition` | Rust capability/reference validation; Studio EntityDefinition inspector | Scene/prefab bootstrap resolves definitions. #5946, #5948, #5950 |
| Actor placement | Player/enemy transforms are repeated in entity definitions, the scene, and the spawn catalog | **Stored:** scene instance transform is initial placement. Entity definitions own reusable capabilities, not per-scene position | Rust scene/reference validation; Studio hierarchy and entity navigation | Runtime materializes the scene instance. #5946, #5948, #5950 |
| Spawn markers | `catalogs/spawns/generated-tunnel.spawns.json`, scene `spawnMarkerId` values, and generator markers overlap | **Stored:** one typed marker record per identity, materialized from generation where applicable; scene instances refer to it | Rust marker/reference validation; Studio scene marker tools and navigation | Encounter/spawn owners resolve stored markers. #5946, #5947, #5948, #5949, #5950 |
| Trigger region | Entity `30`, bounds, tags, and scope are split between `project-bundle.json` and Rust `gameplay_runtime_project_input()` | **Stored:** typed spatial trigger node/definition and binding; compiled behavior keeps only semantics | Rust trigger/reference authority; Studio trigger inspector/gizmo | Runtime overlap owner instantiates the stored trigger. #5946, #5948, #5950 |
| Prefab definitions and variants | `prefabs/registry.json` is stored and validated | **Stored:** canonical prefab registry remains the single definition/variant source | Existing Rust/public prefab validation; Studio prefab/variant inspector | Runtime prefab resolution. #5946, #5948, #5950 |
| Prefab instances and overrides | Two console placements are separately hardcoded in `src/content/prefab-authoring.ts` and Rust `gameplay_runtime_prefab_bootstrap()` | **Stored:** scene prefab-instance nodes or a canonical typed placement document referenced by the scene; instance overrides live with that placement | Rust scene/prefab/reference validation; Studio placement and override inspector | Runtime resolves the same stored instances. #5946, #5948, #5950 |
| Gameplay implementation | `demo-rs/crates/primary-fire-effect` owns challenge reactions and primary-fire transform semantics | **Stored compiled artifact:** provider/module binary and generated manifest; not project JSON and not an `asha-rpg` migration requirement | Rust provider owns codecs, schemas, events, reads, proposals, and state adapters; Studio shows provider identity/metadata read-only | Runtime invokes the statically composed provider. Retained by #5950 |
| Gameplay configuration and bindings | Human values become opaque `canonicalConfig` byte arrays in the bundle and are also rebuilt as Rust literals | **Stored:** provider-owned typed values, bindings, and per-instance overrides; hashes/bytes are derived canonical encoding | Provider codec plus Rust binding registry validation; Studio metadata-driven typed fields/reference pickers | Runtime admits canonical validated configuration. #5946, #5948, #5950 |
| Weapon tuning | Repeated in player `weaponMount`, `primary-fire.weapon.json`, and the upstream default preset | **Stored:** one provider-owned typed configuration selected by the player/weapon binding; definitions contain references rather than copies | Rust/provider codec validation; Studio typed configuration inspector | Combat authority reads the admitted config. #5946, #5948, #5950 |
| Gameplay/material/spawn catalog mirrors | Demo-specific interfaces and decoders in `src/content/project-source.ts`; several files only mirror upstream ids/hashes | **Stored only where the catalog carries project choices.** Pure mirrors are deleted; reusable meaning maps to public typed contracts | Rust canonical codec/reference resolution; Studio project browser | Runtime consumes resolved ids/values, not Demo validators. #5946, #5948, #5950 |
| Scheduler and compatibility identity | Owner/contracts and build digests are copied into `project-bundle.json` and rebuilt in Rust | **Stored:** provider selection and intentional compatibility requirement. **Materialized:** artifact/registry/read-plan digests from the selected build | Rust composition and manifest validation; Studio read-only compatibility diagnostics | Runtime refuses incompatible composition. #5946 and #5950 |
| Startup prefab interaction | `prefabInteraction` causes a fixed event during backend creation | Delete the proof shortcut. A real player interaction becomes a typed **Runtime** input/event and is never persisted as an already-fired event | Rust action/event authority; Studio only authors the interactable binding | Gameplay fabric handles actual input. #5950 |
| Animated mesh resource | GLB, license, and manifest are stored; Demo owns a custom decoder | **Stored:** asset bytes/license plus canonical typed renderer resource manifest/catalog entry | Rust/public resource validation; Studio asset browser/read-only clip metadata | Renderer host loads referenced bytes. #5946, #5948, #5950 |
| Animation/audio/particle cues | Cue objects are inline in `boot-game.ts`; audio WAV and particle SVG bytes are generated in TypeScript | **Stored:** presentation-cue/catalog records and real resource files with canonical identities | Rust/public typed resource and cue validation; Studio asset/cue inspector | Renderer/audio/particle hosts realize projected cues. #5946, #5948, #5950 |
| HUD layout, copy, and input bindings | HTML/CSS plus explicit shell/projection TypeScript | **Stored compiled source:** product UI and non-authoritative projection code; it is not runtime-created world truth | TypeScript projection/shell lanes; Studio project browser may show package/resource identity but is not a UI source editor in this campaign | Browser shell consumes Rust readouts and submits typed actions. Retained by #5950 |
| Launch camera settings | Projection is stored in the bundle; pose is duplicated from the player definition/scene | **Stored:** project launch projection and reference to the player/camera spawn. Scene transform owns initial pose | Rust project/scene validation; Studio project settings and scene inspector | Runtime creates a transient camera from stored launch inputs. #5946, #5948, #5950 |
| Live state | Health, ammo, cooldown, score, trigger overlap, actor transforms, scheduler queues, replay frames, camera pose, particles, and audio playheads | **Runtime:** these are consequences of accepted actions at a particular session revision; persisting them would overwrite authoring intent with one playthrough | Rust authority for gameplay/simulation state; renderer-local ownership for cosmetic playheads; optional Studio runtime inspector is read-only | Runtime and projection only. No migration to stored project content |

## Duplicate construction to remove

The final Demo migration must delete, rather than preserve for old proofs, these
parallel paths:

- the handwritten Demo document interfaces and structural decoders in
  `src/content/project-source.ts` once public Rust-owned codecs cover them;
- the cross-file bootstrap registry assembly in
  `src/content/project-content.ts` where canonical project loading can resolve
  the same references;
- both copies of console placements in `src/content/prefab-authoring.ts` and
  `demo-rs/crates/primary-fire-effect/src/gameplay.rs`;
- the dummy embedded scene, trigger bounds, and project-input artifact assembly
  in `gameplay_runtime_project_input()`;
- runtime tunnel generation and the upstream constant render frame in
  `src/runtime/demo-runtime-gateway.ts` and `src/bootstrap/boot-game.ts`;
- duplicate actor/spawn/weapon values and expected-hash-only catalog records;
- opaque hand-maintained configuration byte arrays and build-derived digests;
  and
- inline generated audio/particle resources and inline presentation cue
  catalogs.

These removals happen only after their canonical replacements exist. Until
then, they remain an explicit migration inventory, not accepted architecture.

## Dependency-ordered implementation checklist

1. **#5945 — map and decision (this document).** Review every later change
   against the pipeline rule and the voxel representation decision.
2. **#5947 — Engine environment materialization.** Convert provider/preset/seed
   into a revision-bound `VoxelVolumeAsset`, materialized scene nodes/markers,
   provenance, and previews without starting gameplay.
3. **#5949 — Studio environment workflow.** Open the real Demo project,
   generate/accept or load the tunnel, assemble authored lights/materials and
   actors, save, close, and reopen with the recognizable environment visible.
4. **#5946 — Engine project-content gaps.** In parallel with the environment
   branch once this map is accepted, provide strict typed authoring for the
   remaining definitions, catalogs, spatial records, resources, and provider
   configurations.
5. **#5948 — Studio project-content inspectors.** Navigate and edit the stored
   non-environment relationships without a running `RuntimeSession`.
6. **#5950 — Demo cutover.** Commit Studio-produced artifacts, replace runtime
   creation with canonical loading, remove every superseded shortcut above,
   and verify Studio edit/save/reopen/run changes the visible product while
   play leaves project files unchanged.

The two Engine/Studio branches may develop independently after #5945, but
#5950 waits for both. Product acceptance is the human Studio-to-Demo loop, not
the number of intermediate receipts or fixtures.

## Review invariants

A later diff is out of alignment if it does any of the following:

- makes runtime launch necessary to discover or create durable project state;
- keeps a simpler inline literal because a proof already knows how to consume
  it;
- gives collision, rendering, and Studio different environment sources;
- stores derived mesh/collision evidence as a second authoring truth;
- moves provider-specific gameplay semantics into generic Engine vocabulary;
- lets TypeScript accept or mutate authoritative stored state; or
- adds a Demo-only authoring API where a typed reusable project pipeline is
  required.
