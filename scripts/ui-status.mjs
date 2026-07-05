export function buildUiStatus() {
  return {
    repo: 'asha-demo',
    playable: true,
    rendererSurface: {
      kind: 'asha_renderer_browser_surface.v0',
      owner: '@asha/renderer-three',
      controls: {
        fire: 'runtime_action_intent.primary_fire',
        mode: 'first_person_generated_tunnel_room',
        pointerLock: 'click_to_lock_escape_to_unlock',
        reset: 'runtime_session_restart_and_camera_reset',
        owner: '@asha/renderer-three',
      },
      publicImports: ['@asha/catalog-core', '@asha/renderer-three', '@asha/runtime-bridge'],
      authorityOwners: {
        collision: '@asha/runtime-bridge',
        combat: '@asha/runtime-bridge',
        contentValidation: '@asha/catalog-core',
        rendering: '@asha/renderer-three',
      },
    },
    currentSurface:
      'Generated-tunnel room demo with durable ProjectBundle/ECRP content, public ASHA renderer surface, RuntimeSession collision, primary-fire combat, HUD, and restart.',
  };
}
