export function buildUiStatus() {
  return {
    repo: 'asha-demo',
    playable: true,
    rendererSurface: {
      kind: 'asha_renderer_surface.v0',
      owner: '@asha/renderer-host',
      controls: {
        fire: 'runtime_action_intent.primary_fire',
        mode: 'first_person_generated_tunnel_room',
        pointerLock: 'click_to_lock_escape_to_unlock',
        reset: 'runtime_session_restart_and_camera_reset',
        owner: '@asha/renderer-host',
      },
      publicImports: ['@asha/catalog-core', '@asha/renderer-host', '@asha/runtime-bridge', '@asha/ui-dom'],
      authorityOwners: {
        collision: '@asha/runtime-bridge',
        combat: '@asha/runtime-bridge',
        contentValidation: '@asha/catalog-core',
        hudProjection: '@asha/ui-dom',
        rendering: '@asha/renderer-host',
      },
      runtimeBackend: {
        defaultMode: 'native',
        authority: 'rust',
        provider: 'globalThis.ashaRuntimeBridge',
        providerAliases: ['globalThis.ashaDemoRuntimeBridge'],
        providerContract: 'asha.runtime_bridge.native_rust_provider.v1',
        requiredBackend: 'native_rust',
        missingBackendBehavior: 'fail_closed',
        referenceFallback: false,
      },
    },
    currentSurface:
      'Generated-tunnel room demo with durable ProjectBundle/ECRP content, public ASHA renderer surface, Rust-backed RuntimeSession authority when a public bridge provider is attached, and fail-closed HUD diagnostics otherwise.',
  };
}
