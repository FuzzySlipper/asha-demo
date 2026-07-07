import type { HudMenuIntent } from '@asha/ui-dom';

export function hudControlToIntent(controlId: string): HudMenuIntent | null {
  if (controlId === 'hud-resume') {
    return { kind: 'ui.resume_intent', source: 'hud_menu' };
  }
  if (controlId === 'hud-restart') {
    return { kind: 'runtime.restart_session_intent', source: 'hud_menu' };
  }
  if (controlId === 'hud-options') {
    return { kind: 'ui.open_options_intent', source: 'hud_menu' };
  }
  if (controlId === 'hud-exit') {
    return { kind: 'ui.exit_to_menu_intent', source: 'hud_menu' };
  }
  return null;
}
