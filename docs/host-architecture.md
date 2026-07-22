# ASHA Demo Host Architecture

Status: canonical project/runtime boundary after #5950.

`asha-demo` has one game content path and two host shapes:

- **Browser-served mode** serves the compiled `dist/ui` surface through the
  public `@asha/browser-host` dev host. It loads `asha.project-bundle.json`
  and installs a public native RuntimeBridge provider at
  `globalThis.ashaRuntimeBridge` before app boot. The compatibility alias
  `globalThis.ashaDemoRuntimeBridge` remains accepted for fail-closed spoof
  coverage, but the product path uses the public provider global.
- **Standalone compiled mode** uses the same built UI/content and the same
  public provider contract, packaged through the host bootstrap in
  `host/standalone-bootstrap.mjs` and checked by `npm run standalone`.

Both modes keep authority upstream:

- RuntimeSession, collision, combat, health/lifecycle, replay, and backend
  selection stay in ASHA runtime/provider surfaces.
- Rendering is mounted through `@asha/renderer-host`; concrete renderer backend
  setup remains host/private, not demo app source.
- Demo TypeScript collects input and projects HUD/menu/readouts only.
- Demo Rust statically links the close-range challenge module into the same
  native RuntimeSession provider. It does not replace RuntimeSession or engine
  owners.

## Named input and pause authority

The playable surface passes the public Rust-backed `RuntimeSessionFacade` input
port into `@asha/renderer-host`. The engine-owned `BrowserInputHost` is the only
production DOM keyboard/mouse listener. It normalizes browser events and asks
Rust Session authority to resolve them against the active input-context stack.

Renderer movement/look consumes that resolved stream internally. The demo shell
reads the renderer host's public delivery readout and consumes each sequence at
most once for gameplay fire and `ResolvedPauseContextConsumer`. Escape therefore
changes both the `menu` context and Session time mode through validated public
operations; the shell's menu mode is presentation only and is never the
simulation gate. While time is paused, rendering, HUD projection, options, and
inspection reads remain live.

Missing input/time operations fail closed with the normal runtime-backend
diagnostic; there is no demo-local key-state or pause fallback. Replay and
cross-provider conformance are tested outside this product repository.

## Stored project and static gameplay composition

`demo-rs/crates/native-runtime-provider` builds the product-owned N-API provider
from the public deferred RuntimeSession builder and the Demo's real
`primary-fire-effect` crate. The provider installs compiled behavior and the
FPS domain adapter, but starts with no project authority. Both hosts then call
`RuntimeSession.loadProject()` with a byte-only source adapter. Rust reads the
root schema-v2 manifest, validates its complete hashed closure, resolves the
compiled provider and typed configuration, activates the stored entry scene,
and exposes the admitted content through the public active-project readout.

The root manifest, ProjectContent documents, scene markers, entity instances,
stored voxel asset, and presentation catalog are the
only product topology. There is no Demo-specific bundle decoder, TS bootstrap
registry, hard-coded Rust project input, runtime generator call, or startup
interaction used to manufacture the playable state.

The close-range rule is a typed gameplay-fabric Transform inside the ordinary
authoritative primary-fire transaction. Rust derives range, target, and weapon
facts from the current Session, runs Guard -> Transform -> React, revalidates the
final Workspace, and commits through the existing combat/lifecycle owners.
Accepted combat and trigger facts then enter the same wave-frozen
fabric and update module-owned challenge state. The browser only submits camera
bound RuntimeSession intents and reads combat projection, composed evidence, and
the provider-owned challenge view.

There is no `gameplay-runtime-host.mjs`, gameplay-specific transport, movement or
weapon event ferry, mirrored EntityStore, or TypeScript callback. Registry,
module state, decision/reaction evidence, scheduler state, pending
continuations, combat authority, and replay are checkpointed and hashed as one
cell. Failed/stale operations reject before mutation through the public bridge.

The host manifests live in `host/browser.host.json` and
`host/standalone.host.json`. The parity check requires both manifests to point
at the same ProjectBundle and use native provider injection without reference
fallback.

The browser command is `npm run dev`, backed by `@asha/browser-host` and default
LAN binding. The static no-provider diagnostic path is `npm run dev:static`.

The standalone command is a host-side smoke for the packaged app path. It builds
`dist/ui`, installs the public native Rust RuntimeBridge provider before app
boot, and loads the same ProjectBundle/content without a dev-server port. Its
ephemeral readout helps developers diagnose host composition and gameplay state;
it is not a product-delivery certificate.
It must not grow a reference/mock fallback or a manual localhost-port requirement.
