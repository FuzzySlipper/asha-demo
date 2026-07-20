# Studio-authored content pipelines

Status: implemented architecture after Den #5945-#5950.

The migration described below is now represented by the root
`asha.project-bundle.json` and its manifest-authorized source closure. References
to removed paths in the comparison table describe the pre-migration baseline,
not supported compatibility surfaces.

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
second runtime-only placement.

The first supported collision-authoritative voxel transform subset is exact:

- the composed world translation may be any finite translation;
- the composed world rotation must be the identity quaternion; and
- the composed world scale must be `[1, 1, 1]`.

"Composed" includes every ancestor transform, not only the `voxelVolume`
node's local fields. #5947 adds a Rust scene-validation rejection dedicated to
this contract (an `InvalidVoxelVolumeTransform` classification with
`nonIdentityRotation` and `nonUnitScale` reasons). The same validation gates
generation acceptance, scene save/open, and RuntimeSession bootstrap. Studio
may disable unsupported voxel rotation/scale controls, but Rust still rejects
them. Neither collision nor rendering may silently bake, ignore, or
independently approximate an unsupported transform.

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

## Spatial storage decisions

The following choices close the remaining spatial alternatives for #5946 and
#5947.

### Prefab instances and variants

`SceneNodeKind::EntityInstance` with a `SceneEntityReference::Prefab` is the
only canonical prefab placement record. The containing scene node owns parent,
order, and local transform; `SceneEntityInstance.instanceId` owns the stable
project identity; the prefab reference owns `prefabId`, optional `variantId`,
and a bounded `instantiationSeed` extension needed for deterministic expansion.
There is no second prefab-placement document.

Reusable prefab structure and overrides live in `prefabs/registry.json`. The
current blue and red console body overrides become named prefab variants and
the two scene nodes select those variants. This campaign does not add a scene
per-instance override list. Authored gameplay-configuration overrides remain
in the gameplay binding registry, but their persisted target becomes the
stable scene `instanceId`; Rust resolves that identity to a live
`PrefabInstanceId` during bootstrap. Runtime numeric prefab-instance ids are
not authored project identities.

Once a player-created prefab is explicitly accepted and saved, it is ordinary
authored scene content. `authored` versus `player` is authoring history, not a
second runtime content kind.

### Scene markers

Marker identity and pose live together in the `SceneDocument`. #5946 adds one
bounded assetless scene kind,
`SceneNodeKind::Marker(SceneMarker { marker_id })` (wire field `markerId`). The
node transform is the marker's only stored pose, and `markerId` is unique within
the scene. Metadata labels/tags remain non-authoritative and cannot replace the
typed id.

#5947 materializes generator spawn/navigation markers as these nodes. An
`EntityInstance.spawnMarkerId` resolves a marker node by typed id. When that
reference is present, the marker's composed transform is the base pose and the
entity node transform is a local offset; the Demo's initially placed actors
use identity offsets so their absolute positions are not duplicated. The
current spawn catalog position records and per-definition `spawnMarker`
capabilities are deleted. Rust derives the bootstrap marker registry from
validated scene markers rather than accepting a separate caller-supplied set
of marker ids.

### Trigger shape, placement, and binding

The close-range trigger is one resolved three-part stored relationship, not one
new all-purpose trigger blob:

1. a canonical `EntityDefinition` owns its reusable `collisionBody`
   half-extents with `staticCollider: false`;
2. a scene `entityInstance` referencing that definition owns its placement;
   and
3. `GameplayTriggerDefinition` owns semantic scope/tags and refers to the
   stable scene `instanceId`.

#5946 replaces the persisted `GameplayTriggerDefinition.entity` runtime number
with a typed `sceneInstanceId` reference and validates that the target resolves
to an EntityDefinition carrying one usable collision body. The initial AABB
trigger contract permits finite composed translation with identity rotation and
unit scale; authors change shape only through the definition half-extents, and
Rust rejects other trigger-instance transforms. Runtime bootstrap allocates the
live Entity id, registers the resolved bounds with the trigger owner, and binds
the semantic definition. The Rust-only `spatialEntities` literal and hardcoded
entity `30` disappear. Studio edits the scene translation, definition bounds,
and semantic binding through linked typed inspectors and draws its trigger
gizmo from that resolved relationship.

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
| Scene hierarchy and placement transforms | `levels/scenes/generated-tunnel-room.scene.json` stores only bootstrap inputs and actor nodes | **Stored:** the scene stores environment, lights, actors, prefab instances, typed markers, and spatial gameplay instances. A scene transform has no second catalog/definition copy | Existing Rust `SceneDocument` authority plus the bounded marker/prefab-seed extensions above; Studio hierarchy/transform tools | Runtime bootstraps the same document. #5946, #5947, #5948, #5949, #5950 |
| Generator recipe and provenance | Bootstrap node plus `levels/presets/tiny-enclosed-tunnel.json`; the latter is mostly expected hashes | **Stored recipe** plus **Materialized output:** typed provider/preset/seed/limits and accepted output identity/provenance | Closed Rust generator registry and revision-bound candidate; Studio Generate/Preview/Accept flow | Recipe is not used by normal play. #5947 and #5949 |
| Tunnel geometry | Recreated during `createDemoRuntimeBackend` and represented to rendering by upstream `TINY_GENERATED_TUNNEL_READOUT` | **Stored:** `VoxelVolumeAsset` in project assets, referenced by a scene `voxelVolume` node | Rust voxel asset codec/authoring; Studio voxel and environment tools | Runtime voxel-world load and renderer-neutral voxel projection. #5947, #5949, #5950 |
| Collision and navigation | `requestGeneratedTunnelOperation` installs a newly generated collision world; expected hashes are mirrored in the preset | **Runtime:** derived from saved occupancy plus its finite translation-only composed scene transform. Optional caches carry source identity and are invalidated, never treated as authoring truth | Rust collision/navigation owners and the exact voxel-transform rejection contract above; Studio read-only bounds/source diagnostics | Movement, picking, path queries. #5947 and #5950 |
| Render mesh/projection | `createAshaRendererGeneratedTunnelRoomSurfaceFrame` consumes an upstream constant rather than the saved scene | **Runtime/editor projection:** mesh chunks derive from saved voxel data and palette | Rust renderer-neutral projection; ordinary Studio viewport | Renderer host consumes projections only. #5947, #5949, #5950 |
| Lights and clear/environment presentation | No light nodes; `boot-game.ts` hardcodes a clear color and relies on renderer defaults | **Stored:** light scene nodes and typed scene/environment settings | Existing Rust scene-light authority; existing Studio light tools, extended only where project settings are missing | Renderer host consumes scene projection. #5949 and #5950 |
| Materials and voxel palette | `catalogs/materials/catalog.json` names roles but not the full material truth | **Stored:** generic material assets/catalog entries; voxel material ids bind through the `VoxelVolumeAsset` palette | Rust asset/catalog/palette validation; Studio material and voxel-palette inspectors | Renderer resolves material assets from projected ids. #5946, #5948, #5949, #5950 |
| Entity definitions | Two actor JSON files are stored, but console definitions exist only as allowed string ids | **Stored:** every referenced actor/console definition is a canonical typed `EntityDefinition` | Rust capability/reference validation; Studio EntityDefinition inspector | Scene/prefab bootstrap resolves definitions. #5946, #5948, #5950 |
| Actor placement | Player/enemy absolute transforms are repeated in entity definitions, the scene, and the spawn catalog | **Stored:** a referenced scene marker owns the base pose and the actor scene node owns only a local offset; current actor offsets are identity. Entity definitions own reusable capabilities, not per-scene positions | Rust scene/marker/reference validation; Studio hierarchy, marker, and entity navigation | Runtime composes marker plus local offset when materializing the scene instance. #5946, #5948, #5950 |
| Spawn/navigation markers | `catalogs/spawns/generated-tunnel.spawns.json`, scene `spawnMarkerId` values, and generator markers overlap | **Stored:** one `SceneNodeKind::Marker` per typed identity; its transform is the only marker pose and generated markers are materialized as normal scene nodes | Rust marker-id/reference validation; Studio marker hierarchy/gizmo and navigation | Encounter/spawn/navigation owners resolve stored scene markers. #5946, #5947, #5948, #5949, #5950 |
| Trigger region | Runtime entity `30`, bounds, tags, and scope are split between `project-bundle.json` and Rust `gameplay_runtime_project_input()` | **Stored:** EntityDefinition collision bounds + scene entity-instance placement + gameplay trigger binding by stable scene `instanceId`, exactly as specified above | Rust cross-document trigger/reference validation; Studio linked definition/scene/binding inspector and gizmo | Runtime allocates the entity and registers one resolved overlap volume. #5946, #5948, #5950 |
| Prefab definitions and variants | `prefabs/registry.json` is stored and validated | **Stored:** canonical prefab registry remains the single definition/variant source | Existing Rust/public prefab validation; Studio prefab/variant inspector | Runtime prefab resolution. #5946, #5948, #5950 |
| Prefab instances and overrides | Two console placements are separately hardcoded in `src/content/prefab-authoring.ts` and Rust `gameplay_runtime_prefab_bootstrap()` | **Stored:** scene `entityInstance` prefab nodes are the only placements; named registry variants own the blue/red structural overrides; gameplay bindings target stable scene instance ids | Rust scene/prefab/variant/binding reference validation; Studio scene placement, variant, and configuration inspector | Runtime resolves the same stored scene instances and derives live prefab-instance ids. #5946, #5948, #5950 |
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
   remaining definitions, catalogs, resources, and provider configurations;
   add the bounded scene marker and prefab instantiation-seed fields; and make
   trigger/gameplay overrides target stable scene instance ids.
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
