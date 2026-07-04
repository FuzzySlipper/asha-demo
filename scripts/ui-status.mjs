export function buildUiStatus() {
  return {
    repo: 'asha-demo',
    playable: true,
    rendererSurface: {
      kind: 'asha_renderer_browser_surface.v0',
      owner: '@asha/renderer-three',
      controls: {
        fire: 'primary_raycast_against_renderer_targets',
        mode: 'first_person_flat_plane',
        pointerLock: 'click_to_lock_escape_to_unlock',
        reset: 'camera_and_target_reset',
        owner: '@asha/renderer-three',
      },
      publicImports: ['@asha/renderer-three'],
      nonClaims: [
        'no_demo_local_three_scene',
        'no_demo_local_renderer_implementation',
        'not_collision_or_gameplay_authority',
      ],
    },
    nonClaims: [
      'The demo page only mounts an upstream ASHA renderer-owned browser surface and controls adapter.',
      'asha-demo does not import Three.js directly or build renderer internals.',
      'This page does not claim combat, HUD, collision, or gameplay authority proof.',
    ],
  };
}
