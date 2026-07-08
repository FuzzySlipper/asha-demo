# ASHA Demo Host Architecture

Status: current host boundary for #4486 and standalone follow-through #4841.

`asha-demo` has one game content path and two host shapes:

- **Browser-served mode** serves the compiled `dist/ui` surface through the
  local dev-server/broker path. It loads `project/project-bundle.json` and
  expects a public native RuntimeBridge provider at `globalThis.ashaRuntimeBridge`
  or the compatibility alias `globalThis.ashaDemoRuntimeBridge`.
- **Standalone compiled mode** uses the same built UI/content and the same
  public provider contract, packaged through the host bootstrap in
  `host/standalone-bootstrap.mjs` and checked by `npm run standalone`.

Both modes keep authority upstream:

- RuntimeSession, collision, combat, health/lifecycle, replay, and backend
  selection stay in ASHA runtime/provider surfaces.
- Rendering is mounted through `@asha/renderer-host`; concrete renderer backend
  setup remains host/private, not demo app source.
- Demo TypeScript collects input and projects HUD/menu/readouts only.
- Demo Rust may preflight content metadata; it does not replace RuntimeSession.

The host manifests live in `host/browser.host.json` and
`host/standalone.host.json`. The parity check requires both manifests to point
at the same ProjectBundle and use native provider injection without reference
fallback.

The standalone command is a host-side smoke for the packaged app path. It builds
`dist/ui`, installs the public native Rust RuntimeBridge provider before app
boot, loads the same ProjectBundle/content without a dev-server port, and writes
`dist/standalone/status.json`. It must not grow a reference/mock fallback or a
manual localhost-port requirement.
