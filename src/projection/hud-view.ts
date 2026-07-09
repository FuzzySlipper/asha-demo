import {
  buildGameHudProjection,
  hudControlToIntent,
  type EditorControl,
  type GameHudProjection,
  type GameHudProjectionInput,
  type HudMenuIntent,
} from '@asha/ui-dom';

export type DemoMenuMode = 'closed' | 'paused' | 'options' | 'exit';
export type DemoHudEventSource = 'movement' | 'runtime';

interface DemoHudViewInput {
  readonly backendMissingLabel: string;
  readonly enemyHealth: {
    readonly current: number;
    readonly max: number;
    readonly percent: number;
    readonly dead: boolean;
  };
  readonly interaction: any;
  readonly lastMovementEvent: string;
  readonly lastRuntimeEvent: string;
  readonly lifecycle: any;
  readonly locked: boolean;
  readonly menuMode: DemoMenuMode;
  readonly lastEventSource: DemoHudEventSource;
  readonly movement: any;
  readonly paused: boolean;
  readonly playerHealth: {
    readonly current: number;
    readonly max: number;
    readonly percent: number;
    readonly dead: boolean;
  };
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
  readonly gameHud: GameHudProjection;
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
    lastEventSource,
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
      : lastEventSource === 'movement' && movement.collided
        ? lastMovementEvent
        : lastRuntimeEvent || interaction.lastEvent;
  const gameHud = buildGameHudProjection(buildGameHudInput({
    enemyHealth,
    eventLabel,
    interaction,
    lifecycle,
    locked,
    menuMode,
    paused,
    playerHealth,
    pose,
  }));
  const playerHealthBar = requireHealthBar(gameHud, 'player-health');
  const enemyHealthBar = requireHealthBar(gameHud, 'target-health');

  return {
    canFire: interaction.canFire,
    gameHud,
    enemyHealthPercent: enemyHealthBar.ratio * 100,
    eventLabel,
    locked,
    lockLabel: locked ? 'LOCKED' : 'UNLOCKED',
    menuMode,
    pauseLabel: paused ? 'Resume' : 'Pause',
    pauseMenuControls: projectPauseMenuControls(gameHud),
    pauseMenuStatus: projectPauseMenuStatus(menuMode),
    playerDead: lifecycle.player.dead,
    playerHealthLabel: `${playerHealthBar.current}/${playerHealthBar.max}`,
    playerHealthPercent: playerHealthBar.ratio * 100,
    poseLabel: `${pose.position[0].toFixed(1)}, ${pose.position[2].toFixed(1)} | ${Math.round(pose.yawDegrees)}`,
    shotLabel: `${gameHud.combat.hits}/${gameHud.combat.shotsFired}`,
    targetLabel: `${interaction.remainingTargets}/${interaction.totalTargets}`,
  };
}

function buildGameHudInput(input: {
  readonly enemyHealth: DemoHudViewInput['enemyHealth'];
  readonly eventLabel: string;
  readonly interaction: any;
  readonly lifecycle: any;
  readonly locked: boolean;
  readonly menuMode: DemoMenuMode;
  readonly paused: boolean;
  readonly playerHealth: DemoHudViewInput['playerHealth'];
  readonly pose: DemoHudViewInput['pose'];
}): GameHudProjectionInput {
  return {
    healthBars: [
      {
        id: 'player-health',
        role: 'player',
        title: 'Player',
        entity: input.lifecycle.player.entity ?? 0,
        current: input.playerHealth.current,
        max: input.playerHealth.max,
        dead: input.playerHealth.dead,
      },
      {
        id: 'target-health',
        role: 'target',
        title: 'Target',
        entity: input.lifecycle.enemy.entity ?? 0,
        current: input.enemyHealth.current,
        max: input.enemyHealth.max,
        dead: input.enemyHealth.dead,
      },
    ],
    combat: {
      shotsFired: input.interaction.shotsFired,
      hits: input.interaction.hits,
      misses: Math.max(0, input.interaction.shotsFired - input.interaction.hits),
      restartCount: input.interaction.restartCount,
      actionTick: input.interaction.actionTick,
    },
    input: {
      pointerLocked: input.locked,
      movementEnabled: !input.paused && !input.lifecycle.player.dead,
      fireEnabled: input.interaction.canFire,
      paused: input.paused,
    },
    pose: {
      position: `${input.pose.position[0].toFixed(1)}, ${input.pose.position[1].toFixed(1)}, ${input.pose.position[2].toFixed(1)}`,
      facing: `${Math.round(input.pose.yawDegrees)}`,
      camera: 'first-person',
    },
    status: [{
      id: 'runtime-event',
      tone: input.lifecycle.player.dead ? 'danger' : 'info',
      text: input.eventLabel,
    }],
    events: [{
      id: 'runtime-event',
      tone: input.lifecycle.player.dead ? 'danger' : 'info',
      text: input.eventLabel,
    }],
    menuOpen: input.menuMode !== 'closed',
    menuControls: [
      { id: 'hud-resume', label: 'Resume', value: 'ui.resume_intent', disabled: input.lifecycle.player.dead },
      { id: 'hud-restart', label: 'Restart', value: 'runtime.restart_session_intent' },
      { id: 'hud-options', label: 'Options', value: 'ui.open_options_intent' },
      { id: 'hud-exit', label: 'Exit', value: 'ui.exit_to_menu_intent' },
    ],
  };
}

function projectPauseMenuControls(gameHud: GameHudProjection): readonly DemoHudControlDescriptor[] {
  return gameHud.menu.controls
    .map((control) => {
      const intent = hudControlToIntent(control.id);
      if (intent === null) {
        return null;
      }
      return { ...control, intent };
    })
    .filter((control): control is DemoHudControlDescriptor => control !== null);
}

function requireHealthBar(gameHud: GameHudProjection, id: string) {
  const healthBar = gameHud.healthBars.find((candidate) => candidate.id === id);
  if (healthBar === undefined) {
    throw new Error(`ASHA game HUD projection missing health bar ${id}`);
  }
  return healthBar;
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
