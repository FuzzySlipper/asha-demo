export function buildUiStatus() {
  return {
    repo: 'asha-demo',
    playable: true,
    rendererSurface: {
      kind: 'asha_renderer_surface.v0',
      owner: '@asha/renderer-host',
      controls: {
        fire: 'runtime_action_intent.primary_fire',
        mode: 'first_person_stored_project_scene',
        pointerLock: 'click_to_lock_escape_to_unlock',
        reset: 'runtime_session_restart_and_camera_reset',
        owner: '@asha/renderer-host',
      },
      publicImports: ['@asha/renderer-host', '@asha/runtime-bridge', '@asha/runtime-session', '@asha/ui-dom'],
      authorityOwners: {
        collision: '@asha/runtime-bridge',
        combat: '@asha/runtime-bridge',
        contentValidation: '@asha/runtime-bridge',
        hudProjection: '@asha/ui-dom',
        rendering: '@asha/renderer-host',
        animationIntent: '@asha/runtime-session',
        animationPlayback: '@asha/renderer-host',
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
      'Studio-inspectable stored project scene with a stored voxel environment, canonical ProjectContent, a hash-pinned animated mesh driven by RuntimeSession animation intent, Rust-backed RuntimeSession authority, and fail-closed HUD diagnostics.',
  };
}
