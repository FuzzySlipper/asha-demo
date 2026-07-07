import type { EditorControl, HudMenuIntent } from '@asha/ui-dom';

export type DemoMenuMode = 'closed' | 'paused' | 'options' | 'exit';

interface DemoHudHealthView {
  readonly current: number;
  readonly max: number;
  readonly percent: number;
  readonly dead: boolean;
}

interface DemoHudViewInput {
  readonly backendMissingLabel: string;
  readonly enemyHealth: DemoHudHealthView;
  readonly interaction: any;
  readonly lastMovementEvent: string;
  readonly lastRuntimeEvent: string;
  readonly lifecycle: any;
  readonly locked: boolean;
  readonly menuMode: DemoMenuMode;
  readonly movement: any;
  readonly paused: boolean;
  readonly playerHealth: DemoHudHealthView;
  readonly pose: {
    readonly position: readonly [number, number, number];
    readonly yawDegrees: number;
  };
  readonly runtimeAvailable: boolean;
}

export interface DemoHudControlDescriptor extends EditorControl {
  readonly intent: HudMenuIntent;
}

export interface DemoHudView {
  readonly canFire: boolean;
  readonly enemyHealthPercent: number;
  readonly eventLabel: string;
  readonly locked: boolean;
  readonly lockLabel: string;
  readonly menuMode: DemoMenuMode;
  readonly pauseLabel: string;
  readonly pauseMenuControls: readonly DemoHudControlDescriptor[];
  readonly pauseMenuStatus: string;
  readonly playerDead: boolean;
  readonly playerHealthLabel: string;
  readonly playerHealthPercent: number;
  readonly poseLabel: string;
  readonly shotLabel: string;
  readonly targetLabel: string;
}

export function projectHudView(input: DemoHudViewInput): DemoHudView {
  const {
    backendMissingLabel,
    enemyHealth,
    interaction,
    lastMovementEvent,
    lastRuntimeEvent,
    lifecycle,
    locked,
    menuMode,
    movement,
    paused,
    playerHealth,
    pose,
    runtimeAvailable,
  } = input;

  const eventLabel = runtimeAvailable === false
    ? backendMissingLabel
    : lifecycle.player.dead
      ? `${lifecycle.outcome.label} - restart available`
      : movement.collided
        ? lastMovementEvent
        : lastRuntimeEvent || interaction.lastEvent;

  return {
    canFire: interaction.canFire,
    enemyHealthPercent: enemyHealth.percent,
    eventLabel,
    locked,
    lockLabel: locked ? 'LOCKED' : 'UNLOCKED',
    menuMode,
    pauseLabel: paused ? 'Resume' : 'Pause',
    pauseMenuControls: projectPauseMenuControls(lifecycle),
    pauseMenuStatus: projectPauseMenuStatus(menuMode),
    playerDead: lifecycle.player.dead,
    playerHealthLabel: `${playerHealth.current}/${playerHealth.max}`,
    playerHealthPercent: playerHealth.percent,
    poseLabel: `${pose.position[0].toFixed(1)}, ${pose.position[2].toFixed(1)} | ${Math.round(pose.yawDegrees)}`,
    shotLabel: `${interaction.hits}/${interaction.shotsFired}`,
    targetLabel: `${interaction.remainingTargets}/${interaction.totalTargets}`,
  };
}

function projectPauseMenuControls(lifecycle: any): readonly DemoHudControlDescriptor[] {
  return [
    {
      id: 'hud-resume',
      role: 'button',
      label: 'Resume',
      value: 'ui.resume_intent',
      disabled: lifecycle.player.dead,
      intent: { kind: 'ui.resume_intent', source: 'hud_menu' },
    },
    {
      id: 'hud-restart',
      role: 'button',
      label: 'Restart',
      value: 'runtime.restart_session_intent',
      intent: { kind: 'runtime.restart_session_intent', source: 'hud_menu' },
    },
    {
      id: 'hud-options',
      role: 'button',
      label: 'Options',
      value: 'ui.open_options_intent',
      intent: { kind: 'ui.open_options_intent', source: 'hud_menu' },
    },
    {
      id: 'hud-exit',
      role: 'button',
      label: 'Exit',
      value: 'ui.exit_to_menu_intent',
      intent: { kind: 'ui.exit_to_menu_intent', source: 'hud_menu' },
    },
  ];
}

function projectPauseMenuStatus(menuMode: DemoMenuMode): string {
  if (menuMode === 'exit') {
    return 'Exited to menu. Resume or restart when ready.';
  }
  if (menuMode === 'options') {
    return 'Options are read-only for this demo build.';
  }
  return 'Runtime paused. Resume or restart through typed HUD intents.';
}
