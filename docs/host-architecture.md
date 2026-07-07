# ASHA Demo Host Architecture

Status: current host boundary for #4486.

`asha-demo` has one game content path and two host shapes:

- **Browser-served mode** serves the compiled `dist/ui` surface through the
  local dev-server/broker path. It loads `project/project-bundle.json` and
  expects a public native RuntimeBridge provider at `globalThis.ashaRuntimeBridge`
  or the compatibility alias `globalThis.ashaDemoRuntimeBridge`.
- **Standalone compiled mode** must use the same ProjectBundle/content and the
  same public provider contract, but packaged by a host rather than by a manual
  browser/dev-server shortcut.

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

The standalone command is intentionally marked planned until ASHA exposes the
missing upstream packaged native host surface. The first valid implementation
must be a compiled host that injects the native RuntimeBridge provider and serves
or embeds the built UI/content. It must not be a browser shortcut to a manually
managed localhost port.
