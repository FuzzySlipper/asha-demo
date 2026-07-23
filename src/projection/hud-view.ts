import {
  buildGameHudProjection,
  hudControlToIntent,
  type EditorControl,
  type GameHudProjection,
  type GameHudProjectionInput,
  type HudMenuIntent,
} from '@asha/ui-dom';

export type DemoMenuMode = 'closed' | 'paused' | 'options' | 'title';
export type DemoHudEventSource = 'movement' | 'runtime';

interface DemoHudViewInput {
  readonly backendMissingLabel: string;
  readonly gameplayChallenge: {
    readonly status: string;
    readonly score: number;
    readonly objectivePoints: number;
    readonly closeRangeHits: number;
  };
  readonly animationPlayback: any;
  readonly animationSampledCue: any;
  readonly enemyHealth: {
    readonly current: number;
    readonly max: number;
    readonly percent: number;
    readonly dead: boolean;
  };
  readonly interaction: any;
  readonly interactionTarget: {
    readonly eligible: boolean;
    readonly distanceMillimeters: number | null;
  } | null;
  readonly inputSettings: {
    readonly invertY: boolean;
    readonly lookSensitivityDegreesPerPixel: number;
    readonly moveSpeedUnitsPerSecond: number;
  };
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
  readonly challengeLabel: string;
  readonly challengeStatus: string;
  readonly gameHud: GameHudProjection;
  readonly enemyHealthPercent: number;
  readonly eventLabel: string;
  readonly animationLabel: string;
  readonly animationCueLabel: string;
  readonly animationCueStatus: string;
  readonly inputSettings: DemoHudViewInput['inputSettings'];
  readonly interactionPrompt: string | null;
  readonly locked: boolean;
  readonly lockLabel: string;
  readonly menuTitle: string;
  readonly menuMode: DemoMenuMode;
  readonly pauseLabel: string;
  readonly pauseMenuControls: readonly DemoHudControlDescriptor[];
  readonly pauseMenuStatus: string;
  readonly playerDead: boolean;
  readonly playerHealthLabel: string;
  readonly playerHealthPercent: number;
  readonly poseLabel: string;
  readonly restartLabel: string;
  readonly resumeLabel: string;
  readonly shotLabel: string;
  readonly targetLabel: string;
}

export function projectHudView(input: DemoHudViewInput): DemoHudView {
  const {
    backendMissingLabel,
    animationPlayback,
    animationSampledCue,
    enemyHealth,
    gameplayChallenge,
    interaction,
    interactionTarget,
    inputSettings,
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
  const interactionPrompt = interactionTarget?.eligible === true
    ? `E  OPERATE SECURITY SWITCH · ${Math.round((interactionTarget.distanceMillimeters ?? 0) / 100) / 10} M`
    : null;

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
    challengeLabel: projectEncounterObjective(menuMode, lifecycle, paused),
    challengeStatus: projectEncounterStatus(menuMode, lifecycle, paused),
    gameHud,
    enemyHealthPercent: enemyHealthBar.ratio * 100,
    eventLabel,
    animationLabel: projectAnimationLabel(animationPlayback),
    animationCueLabel: projectAnimationCueLabel(animationSampledCue),
    animationCueStatus: animationSampledCue?.status ?? 'waiting',
    inputSettings,
    interactionPrompt,
    locked,
    lockLabel: locked ? 'MOUSE CAPTURED' : 'MOUSE FREE',
    menuTitle: projectMenuTitle(menuMode),
    menuMode,
    pauseLabel: paused ? 'Resume' : 'Pause',
    pauseMenuControls: projectPauseMenuControls(gameHud),
    pauseMenuStatus: projectPauseMenuStatus(menuMode),
    playerDead: lifecycle.player.dead,
    playerHealthLabel: `${playerHealthBar.current}/${playerHealthBar.max}`,
    playerHealthPercent: playerHealthBar.ratio * 100,
    poseLabel: `${pose.position[0].toFixed(1)}, ${pose.position[2].toFixed(1)} | ${Math.round(pose.yawDegrees)}`,
    restartLabel: menuMode === 'title' ? 'Start' : 'Restart',
    resumeLabel: menuMode === 'title' ? 'Resume' : 'Resume',
    shotLabel: `${gameHud.combat.hits} hits · ${gameHud.combat.misses} misses`,
    targetLabel: `${enemyHealth.current}/${enemyHealth.max}`,
  };
}

function projectEncounterObjective(menuMode: DemoMenuMode, lifecycle: any, paused: boolean): string {
  if (lifecycle.enemy.dead) return 'OBJECTIVE COMPLETE';
  if (lifecycle.player.dead) return 'PLAYER DEFEATED';
  if (menuMode === 'title') return 'DEFEAT THE TUNNEL SENTINEL';
  if (paused) return 'ENCOUNTER PAUSED';
  return 'SENTINEL ENGAGED';
}

function projectEncounterStatus(menuMode: DemoMenuMode, lifecycle: any, paused: boolean): string {
  if (lifecycle.enemy.dead) return 'complete';
  if (lifecycle.player.dead) return 'failed';
  if (menuMode === 'title') return 'ready';
  return paused ? 'paused' : 'active';
}

function projectAnimationCueLabel(status: any): string {
  if (status?.cue === null || status?.cue === undefined) {
    return 'WAITING';
  }
  const cue = status.cue;
  return `${String(cue.clip).toUpperCase()} @ ${Number(cue.markerSeconds).toFixed(2)}S · ${String(status.status).toUpperCase()}`;
}

function projectAnimationLabel(playback: any): string {
  if (playback === null || playback === undefined || playback.status === 'unavailable') {
    return 'UNAVAILABLE';
  }
  const clip = playback.selectedClip ?? 'NONE';
  return `${clip.toUpperCase()} ${playback.status.toUpperCase()}`;
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
  if (menuMode === 'title') {
    return 'Defeat the tunnel sentinel. Move with WASD, aim with the mouse, and fire before it closes the distance.';
  }
  if (menuMode === 'options') {
    return 'Input settings apply before browser input is submitted to ASHA authority.';
  }
  return 'The encounter is frozen. Resume or restart through runtime authority.';
}

function projectMenuTitle(menuMode: DemoMenuMode): string {
  return menuMode === 'title' ? 'ASHA Demo' : 'Paused';
}
