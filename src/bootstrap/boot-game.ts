import {
  createAshaRendererGeneratedTunnelRoomSurfaceFrame,
  mountAshaRendererSurface,
} from '@asha/renderer-host';
import {
  TINY_GENERATED_TUNNEL_READOUT,
} from '@asha/runtime-bridge';
import { hudControlToIntent } from '../input/hud-controls.js';
import { type DemoHudEventSource, type DemoMenuMode, projectHudView } from '../projection/hud-view.js';
import { createDemoRuntimeBackend, createDemoRuntimeGateway } from '../runtime/demo-runtime-gateway.js';
import { readDemoHudElements } from '../shell/hud-elements.js';
import { renderHudElements } from '../shell/hud-renderer.js';
import { pulseReticleElement } from '../shell/reticle-renderer.js';
import {
  loadDemoProjectContent,
  readDemoProjectContentStatus,
} from '../content/project-content.js';

export async function bootGame() {
const elements = readDemoHudElements();
const canvas = elements.canvas;
const reticle = elements.reticle;

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('ASHA renderer surface canvas is missing.');
}

const demoProjectContent = await loadDemoProjectContent();
const contentStatus = readDemoProjectContentStatus(demoProjectContent);
if (!contentStatus.valid) {
  throw new Error(`ASHA demo project content is invalid: ${contentStatus.diagnostics.join('; ')}`);
}

const runtimeBackend = await createDemoRuntimeBackend(demoProjectContent);
const runtimeGateway = createDemoRuntimeGateway(runtimeBackend);
const ecrpProjectLoadReceipt = runtimeBackend.loadReceipt;

let runtimeCamera = createRuntimeCamera();
let enemyPolicyTick = 0;
let paused = false;
let menuMode: DemoMenuMode = 'closed';
let lastMenuIntent = null;
const generatedTunnelReadout = TINY_GENERATED_TUNNEL_READOUT;
const levelFrame = createAshaRendererGeneratedTunnelRoomSurfaceFrame({
  tunnel: generatedTunnelReadout,
  enemy: readEnemyRenderFrameTarget(),
});

const surface = mountAshaRendererSurface(canvas, {
  autoStart: true,
  clearColor: 0x101820,
  frame: levelFrame,
  controls: {
    initialPosition: demoProjectContent.runtime.initialCameraPose.position,
    movementAuthority: constrainCameraMovement,
  },
});

let animationFrame = null;
let enemyLoopTimer = null;
let lastEnemyPolicyReadout = null;
let lastGameRuleEffect = null;
let lastEventSource: DemoHudEventSource = 'runtime';
let lastMovementEvent = 'Authority ready';
let lastRuntimeEvent = 'Runtime ready';
let reticlePulseTimer = null;

function createRuntimeCamera() {
  const fallbackCamera = {
    handle: -1,
    pose: demoProjectContent.runtime.initialCameraPose,
    projection: demoProjectContent.runtime.cameraProjection,
    viewport: readViewport(),
  };
  if (!runtimeGateway.available()) {
    return fallbackCamera;
  }
  return runtimeGateway.createCamera({
    initialPose: demoProjectContent.runtime.initialCameraPose,
    projection: demoProjectContent.runtime.cameraProjection,
    viewport: readViewport(),
  })?.snapshot ?? fallbackCamera;
}

function constrainCameraMovement(input) {
  if (!runtimeGateway.available()) {
    lastMovementEvent = runtimeBackend.diagnostics[0]?.message ?? 'Movement blocked: Rust runtime backend missing';
    lastEventSource = 'movement';
    return {
      blockedAxes: ['x', 'y', 'z'],
      collided: true,
      movementHash: runtimeBackend.backendHash,
      pose: runtimeCamera.pose,
    };
  }

  const lifecycle = readLifecycleStatus();
  const blockedByUi = paused || lifecycle.player.dead;
  const inputForAuthority = blockedByUi
    ? {
        moveForward: 0,
        moveRight: 0,
        moveUp: 0,
      }
    : {
        moveForward: input.moveForward,
        moveRight: input.moveRight,
        moveUp: input.moveUp,
      };
  const yawDeltaDegrees = paused ? 0 : input.yawDeltaDegrees;
  const pitchDeltaDegrees = paused ? 0 : input.pitchDeltaDegrees;
  const receipt = runtimeGateway.applyCollisionConstrainedCameraInput({
    camera: readRuntimeCameraHandle(),
    grid: 1,
    input: {
      moveForward: inputForAuthority.moveForward,
      moveRight: inputForAuthority.moveRight,
      moveUp: inputForAuthority.moveUp,
      yawDeltaDegrees,
      pitchDeltaDegrees,
      dtSeconds: input.dtSeconds,
      moveSpeedUnitsPerSecond: input.moveSpeedUnitsPerSecond,
    },
    tick: input.tick,
    shape: demoProjectContent.runtime.collisionShape,
    policy: demoProjectContent.runtime.collisionPolicy,
  });
  runtimeCamera = receipt.snapshot.after;
  lastMovementEvent = paused
    ? 'Movement paused'
    : lifecycle.player.dead
      ? 'Movement blocked: player defeated'
      : receipt.collided
        ? `Blocked ${receipt.blockedAxes.join(', ')}`
        : 'Moved';
  lastEventSource = 'movement';
  return {
    blockedAxes: receipt.blockedAxes,
    collided: receipt.collided,
    movementHash: receipt.movementHash,
    basis: receipt.snapshot.after.basis,
    pose: {
      position: receipt.snapshot.after.pose.position,
      yawDegrees: receipt.snapshot.after.pose.yawDegrees,
      pitchDegrees: receipt.snapshot.after.pose.pitchDegrees,
    },
  };
}

window.addEventListener('beforeunload', () => {
  if (animationFrame !== null) {
    window.cancelAnimationFrame(animationFrame);
  }
  if (enemyLoopTimer !== null) {
    window.clearInterval(enemyLoopTimer);
  }
  surface.dispose();
});

elements.lockButton?.addEventListener('click', () => {
  surface.lockPointer();
});

elements.fireButton?.addEventListener('click', () => {
  firePrimary();
});

elements.resetButton?.addEventListener('click', () => {
  resetLoop();
});

elements.pauseButton?.addEventListener('click', () => {
  if (paused) {
    handleHudControl('hud-resume');
  } else {
    openPauseMenu('paused');
  }
});

elements.resumeButton?.addEventListener('click', () => {
  handleHudControl('hud-resume');
});

elements.menuResetButton?.addEventListener('click', () => {
  handleHudControl('hud-restart');
});

elements.optionsButton?.addEventListener('click', () => {
  handleHudControl('hud-options');
});

elements.exitButton?.addEventListener('click', () => {
  handleHudControl('hud-exit');
});

document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !surface.pointerLocked()) {
    return;
  }
  event.preventDefault();
  firePrimary();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    openPauseMenu('paused');
  } else if (event.code === 'Space' && surface.pointerLocked()) {
    event.preventDefault();
    firePrimary();
  } else if (event.code === 'KeyR') {
    event.preventDefault();
    resetLoop();
  }
});

function firePrimary() {
  const playable = readPlayableLoopState();
  if (!runtimeGateway.available() || !playable.commands.canFire) {
    lastRuntimeEvent = readFireBlockedEvent(playable.commands.blockedReasons);
    lastEventSource = 'runtime';
    pulseReticle('miss');
    renderHud();
    return {
      interaction: readRuntimeInteractionState(),
      runtime: null,
    };
  }

  const actionReceipt = runtimeGateway.submitPrimaryFire({
    phase: 'pressed',
    camera: {
      ...runtimeCamera,
      pose: surface.cameraPose(),
    },
    tick: playable.counters.actionTick,
    source: 'browser_fps_pointer',
    pressed: true,
    baseDamage: demoProjectContent.catalogs.weapon.damage,
    rangeMillimeters: demoProjectContent.catalogs.weapon.rangeUnits * 1000,
  });
  lastGameRuleEffect = actionReceipt.hookReceipt === undefined ? null : {
    moduleRef: actionReceipt.hookReceipt.moduleRef,
    hookId: actionReceipt.hookReceipt.hookId,
    status: actionReceipt.hookReceipt.status,
    proposalHash: actionReceipt.hookReceipt.proposalHash,
    replayHash: actionReceipt.replayEvidence?.replayHash ?? null,
    validationStatus: actionReceipt.replayEvidence?.validationStatus ?? null,
  };

  if (actionReceipt.accepted && actionReceipt.combatReadout?.outcome.kind === 'hit') {
    lastRuntimeEvent = lastGameRuleEffect === null
      ? 'Fire hit'
      : `Fire hit - ${lastGameRuleEffect.moduleRef.moduleId}`;
    lastEventSource = 'runtime';
    pulseReticle('hit');
  } else {
    lastRuntimeEvent = actionReceipt.accepted ? 'Fire missed' : 'Fire rejected';
    lastEventSource = 'runtime';
    pulseReticle('miss');
  }
  projectRuntimeTargetState();
  renderHud();
  return {
    interaction: readRuntimeInteractionState(),
    runtime: actionReceipt,
  };
}

function readFireBlockedEvent(blockedReasons) {
  if (blockedReasons.includes('missing_backend')) {
    return 'Fire blocked: Rust runtime backend missing';
  }
  if (blockedReasons.includes('paused')) {
    return 'Fire blocked: paused';
  }
  if (blockedReasons.includes('player_dead')) {
    return 'Fire blocked: player defeated';
  }
  if (blockedReasons.includes('target_defeated')) {
    return 'Fire blocked: target defeated';
  }
  return 'Fire blocked';
}

function resetLoop() {
  if (!runtimeGateway.available()) {
    runtimeCamera = createRuntimeCamera();
    enemyPolicyTick = 0;
    lastEnemyPolicyReadout = null;
    paused = false;
    menuMode = 'closed';
    lastMovementEvent = 'Reset unavailable: Rust runtime backend missing';
    lastRuntimeEvent = lastMovementEvent;
    lastEventSource = 'runtime';
    surface.reset();
    projectRuntimeTargetState();
    pulseReticle('miss');
    renderHud();
    return;
  }

  const statusBefore = readLifecycleStatus();
  const restartReceipt = runtimeGateway.requestSessionRestart({
    kind: 'runtime.restart_session_intent',
    source: 'hud_menu',
    requireTerminal: false,
    expectedSessionHash: statusBefore.sessionHash,
  });
  runtimeCamera = createRuntimeCamera();
  enemyPolicyTick = 0;
  lastEnemyPolicyReadout = null;
  paused = false;
  menuMode = 'closed';
  lastMovementEvent = 'Reset';
  lastRuntimeEvent = restartReceipt.accepted ? 'Runtime reset' : 'Reset rejected';
  lastEventSource = 'runtime';
  surface.reset();
  projectRuntimeTargetState();
  pulseReticle('reset');
  renderHud();
}

function openPauseMenu(mode: DemoMenuMode) {
  paused = true;
  menuMode = mode;
  document.exitPointerLock?.();
  lastRuntimeEvent = mode === 'exit' ? 'Exited to menu' : 'Paused';
  lastEventSource = 'runtime';
  renderHud();
  return readRuntimeInteractionState();
}

function closePauseMenu() {
  paused = false;
  menuMode = 'closed';
  lastRuntimeEvent = 'Resumed';
  lastEventSource = 'runtime';
  renderHud();
  return readRuntimeInteractionState();
}

function handleHudControl(controlId) {
  const intent = hudControlToIntent(controlId);
  if (intent === null) {
    return null;
  }
  lastMenuIntent = intent;
  if (intent.kind === 'ui.resume_intent') {
    return closePauseMenu();
  }
  if (intent.kind === 'runtime.restart_session_intent') {
    resetLoop();
    return readRuntimeInteractionState();
  }
  if (intent.kind === 'ui.open_options_intent') {
    return openPauseMenu('options');
  }
  if (intent.kind === 'ui.exit_to_menu_intent') {
    return openPauseMenu('exit');
  }
  return null;
}

function pulseReticle(kind) {
  reticlePulseTimer = pulseReticleElement(reticle, kind, reticlePulseTimer);
}

function renderHud() {
  const pose = surface.cameraPose();
  const interaction = readRuntimeInteractionState();
  const lifecycle = readLifecycleStatus();
  const movement = surface.movementState();
  const locked = surface.pointerLocked();
  const enemyHealth = readEnemyHealth();
  const playerHealth = readPlayerHealth();

  renderHudElements(elements, projectHudView({
    backendMissingLabel: runtimeBackend.diagnostics[0]?.message ?? 'Rust runtime backend missing',
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
    runtimeAvailable: runtimeGateway.available(),
  }));
}

function projectRuntimeTargetState() {
  const enemyHealth = readEnemyHealth();
  if (typeof surface.projectRenderTargetProjection !== 'function') {
    const renderTarget = readEnemyRenderTarget(!enemyHealth.dead);
    surface.projectTargetProjection({
      visible: !enemyHealth.dead,
      position: renderTarget.position,
      scale: renderTarget.scale ?? demoProjectContent.runtime.enemyRenderTarget.scale,
      lastEvent: enemyHealth.dead ? 'Enemy defeated' : lastRuntimeEvent,
    });
    return;
  }
  surface.projectRenderTargetProjection(readEnemyRenderTarget(!enemyHealth.dead), {
    lastEvent: enemyHealth.dead ? 'Enemy defeated' : lastRuntimeEvent,
  });
}

function readEnemyRenderFrameTarget() {
  const target = readEnemyRenderTarget(true);
  return {
    label: target.renderLabel,
    position: target.position,
    scale: target.scale ?? demoProjectContent.runtime.enemyRenderTarget.scale,
  };
}

function readEnemyRenderTarget(visible) {
  const renderTarget = readActorCapability('actor/generated-tunnel-enemy', 'renderProjection')?.target ?? null;
  if (renderTarget !== null) {
    return renderTarget;
  }
  const enemyTransform = readEnemyTransform();
  return {
    kind: 'runtime_session.ecrp_render_target.v0',
    renderLabel: demoProjectContent.runtime.enemyRenderTarget.label,
    visible,
    position: enemyTransform.position,
    scale: demoProjectContent.runtime.enemyRenderTarget.scale,
  };
}

function tickEnemyPolicy() {
  if (!runtimeGateway.available()) {
    lastRuntimeEvent = 'Enemy loop blocked: Rust runtime backend missing';
    lastEventSource = 'runtime';
    renderHud();
    return lastEnemyPolicyReadout;
  }

  const encounterTick = runtimeGateway.readPlayableEncounterTick({
    targetCamera: readRuntimeCameraHandle(),
    targetPosition: runtimeCamera.pose.position,
    tick: enemyPolicyTick,
    shell: {
      paused,
    },
  });
  if (encounterTick.status === 'blocked') {
    lastRuntimeEvent = encounterTickBlockedEvent(encounterTick.blockedReason);
    lastEventSource = 'runtime';
    renderHud();
    return lastEnemyPolicyReadout;
  }

  enemyPolicyTick += 1;
  const readout = encounterTick.autonomousPolicy;
  lastEnemyPolicyReadout = readout;

  if (encounterTick.combatSummary?.status === 'accepted') {
    lastRuntimeEvent = 'Enemy hit';
    lastEventSource = 'runtime';
  } else if (encounterTick.movementSummary?.status === 'accepted') {
    lastRuntimeEvent = 'Enemy moved';
    lastEventSource = 'runtime';
  }
  if (encounterTick.lifecycleAfter?.player.dead) {
    lastRuntimeEvent = 'Player defeated';
    lastEventSource = 'runtime';
  }
  projectRuntimeTargetState();
  renderHud();
  return readout;
}

function readRuntimeCameraHandle() {
  if (typeof runtimeCamera === 'number') {
    return runtimeCamera;
  }
  return runtimeCamera.handle ?? runtimeCamera.camera;
}

function encounterTickBlockedEvent(reason) {
  if (reason === 'paused') {
    return 'Enemy loop paused';
  }
  if (reason === 'player_dead') {
    return 'Player defeated';
  }
  if (reason === 'enemy_dead') {
    return 'Enemy defeated';
  }
  if (reason === 'missing_enemy') {
    return 'Enemy loop blocked: enemy missing';
  }
  if (reason === 'missing_player') {
    return 'Enemy loop blocked: player missing';
  }
  return 'Enemy loop blocked: Rust runtime backend missing';
}

function readRuntimeInteractionState() {
  const playable = readPlayableLoopState();
  return {
    actionTick: playable.counters.actionTick,
    canFire: playable.commands.canFire,
    fireBlockedReasons: [...playable.commands.blockedReasons],
    hits: playable.counters.hits,
    lastEvent: lastRuntimeEvent,
    lastMenuIntent,
    lifecycleOutcome: readLifecycleStatus().outcome.kind,
    gameRuleEffect: lastGameRuleEffect,
    menuMode,
    paused,
    playerDead: playable.health.player.dead,
    playerHealth: playable.health.player.current,
    restartCount: playable.currentEpoch.restartCount,
    remainingTargets: playable.counters.remainingTargets,
    shotsFired: playable.counters.shotsFired,
    targetHealth: playable.health.enemy.current,
    totalTargets: playable.counters.totalTargets,
  };
}

function readPlayableLoopState() {
  const runtimePlayable = runtimeGateway.readPlayableLoopState({
    paused,
    menuMode,
  });
  if (runtimePlayable !== null) {
    return runtimePlayable;
  }
  const playerHealth = readPlayerHealth();
  const enemyHealth = readEnemyHealth();
  return {
    kind: 'runtime_session.playable_loop_state.v0',
    status: 'missing_backend',
    sequenceId: 0,
    tick: 0,
    sessionHash: runtimeBackend.backendHash,
    currentEpoch: {
      restartCount: 0,
      replayRecordStartIndex: 0,
      replayRecordCount: 0,
      source: 'after_last_restart_record',
    },
    counters: {
      actionTick: 0,
      hits: 0,
      remainingTargets: enemyHealth.dead ? 0 : 1,
      shotsFired: 0,
      totalTargets: 1,
    },
    health: {
      player: playerHealth,
      enemy: enemyHealth,
    },
    commands: {
      canFire: false,
      canRestart: false,
      blockedReasons: ['missing_backend'],
    },
    shell: {
      paused,
      menuMode,
    },
    target: null,
    diagnostics: runtimeBackend.diagnostics.map((diagnostic) => ({
      code: 'missing_runtime_session',
      message: diagnostic.message,
    })),
    nonClaims: ['not_ui_authority', 'not_replay_history_counter', 'not_demo_local_authority'],
  };
}

function readEnemyTransform() {
  return readActorCapability('actor/generated-tunnel-enemy', 'transform') ?? {
    position: demoProjectContent.runtime.enemyRenderTarget.position,
    yawDegrees: 0,
    pitchDegrees: 0,
  };
}

function readEnemyHealth() {
  return readHealth('actor/generated-tunnel-enemy');
}

function readPlayerHealth() {
  return readHealth('actor/demo-player');
}

function readHealth(stableId) {
  const health = readActorCapability(stableId, 'health');
  if (health?.kind !== 'health') {
    return {
      current: 0,
      dead: true,
      max: 1,
      percent: 0,
    };
  }
  return {
    current: health.current,
    dead: health.dead,
    max: health.max,
    percent: Math.max(0, Math.min(100, (health.current / health.max) * 100)),
  };
}

function readActorCapability(stableId, kind) {
  const readout = readEcrpRuntimeReadout();
  const enemy = readout.entities.find(
    (entity) => entity.definitionStableId === stableId,
  );
  const runtimeCapability = enemy?.capabilities.find((capability) => capability.kind === kind) ?? null;
  if (runtimeCapability !== null) {
    return runtimeCapability;
  }
  return readAuthoredActorCapability(stableId, kind);
}

function tickHud() {
  renderHud();
  animationFrame = window.requestAnimationFrame(tickHud);
}

renderHud();
projectRuntimeTargetState();
enemyLoopTimer = window.setInterval(() => {
  tickEnemyPolicy();
}, 750);
tickHud();

(globalThis as any).ashaRendererSurface = {
  kind: surface.kind,
  cameraPose: () => surface.cameraPose(),
  firePrimary: () => firePrimary(),
  enemyLoopState: () => lastEnemyPolicyReadout,
  gameRuleEffectState: () => lastGameRuleEffect,
  interactionState: () => readRuntimeInteractionState(),
  movementState: () => surface.movementState(),
  pointerLocked: () => surface.pointerLocked(),
  projectContentStatus: () => ({
    ...readDemoProjectContentStatus(demoProjectContent),
    gameRuleModules: demoProjectContent.gameRuleModules.map((manifest) => manifest.moduleRef),
    levelRenderProjectionHash: generatedTunnelReadout.renderProjection.hash,
    levelSurfaceLabels: ['generated-tunnel-floor', demoProjectContent.runtime.enemyRenderTarget.label],
    runtimeBackend: runtimeBackend.status,
    runtimeBackendDiagnostics: runtimeBackend.diagnostics,
    runtimeBackendProfile: runtimeBackend.profile,
    runtimeLoaded: runtimeBackend.available && ecrpProjectLoadReceipt.accepted,
    runtimeBootstrapHash: ecrpProjectLoadReceipt.bootstrapHash,
  }),
  reset: () => resetLoop(),
  runtimeBackendStatus: () => runtimeBackend,
  runtimeEcrpReadout: () => readEcrpRuntimeReadout(),
  runtimeTelemetry: () => readRuntimeTelemetry(),
  snapshot: () => surface.snapshot(),
  tickEnemyPolicy: () => tickEnemyPolicy(),
};

function readViewport() {
  return {
    width: canvas.clientWidth || 1280,
    height: canvas.clientHeight || 720,
  };
}

function readLifecycleStatus() {
  const status = runtimeGateway.readLifecycleStatus();
  if (status !== null) {
    return status;
  }
  return fallbackLifecycleStatus();
}

function fallbackLifecycleStatus() {
  const playerHealth = readAuthoredActorCapability('actor/demo-player', 'health') ?? {
    current: 0,
    max: 1,
    dead: true,
  };
  const enemyHealth = readAuthoredActorCapability('actor/generated-tunnel-enemy', 'health') ?? {
    current: 0,
    max: 1,
    dead: true,
  };
  return {
    kind: 'runtime_session.lifecycle_status.v0',
    scenario: 'generated_tunnel',
    sequenceId: 0,
    tick: 0,
    sessionHash: runtimeBackend.backendHash,
    player: {
      role: 'player',
      health: {
        entity: 10,
        current: playerHealth.current,
        max: playerHealth.max,
        dead: playerHealth.dead,
        healthHash: 'missing-rust-backend:player-health',
      },
      dead: playerHealth.dead,
    },
    enemy: {
      role: 'enemy',
      health: {
        entity: 20,
        current: enemyHealth.current,
        max: enemyHealth.max,
        dead: enemyHealth.dead,
        healthHash: 'missing-rust-backend:enemy-health',
      },
      dead: enemyHealth.dead,
    },
    outcome: {
      kind: 'in_progress',
      terminal: false,
      reason: 'none',
      label: 'Runtime backend missing',
    },
    restart: {
      eligible: false,
      intentKind: 'runtime.restart_session_intent',
      reason: 'rust_epoch_restart',
    },
    events: [],
    fixture: {
      seed: demoProjectContent.runtime.seed,
      sceneId: demoProjectContent.projectBundle.runtimeRequest.sceneId,
      bundleSchemaVersion: demoProjectContent.projectBundle.runtimeRequest.bundleSchemaVersion,
      protocolVersion: demoProjectContent.projectBundle.runtimeRequest.protocolVersion,
      resetHash: runtimeBackend.backendHash,
    },
    hashes: {
      lifecycleHash: runtimeBackend.backendHash,
      playerHealthHash: 'missing-rust-backend:player-health',
      enemyHealthHash: 'missing-rust-backend:enemy-health',
      replayHash: runtimeBackend.backendHash,
    },
    nonClaims: ['not_save_load_persistence', 'not_ui_authority', 'not_demo_local_lifecycle'],
  };
}

function readEcrpRuntimeReadout() {
  const readout = runtimeGateway.readEcrpRuntimeReadout();
  if (readout !== null) {
    return readout;
  }
  return {
    kind: 'runtime_session.ecrp_readout.v0',
    sequenceId: 0,
    tick: 0,
    sessionHash: runtimeBackend.backendHash,
    authority: {
      mode: 'rust',
      source: 'missing_backend',
      surface: 'runtime_session.fps.public_bridge_required.v0',
      readSets: [],
    },
    entityCount: 0,
    entities: [],
  };
}

function readRuntimeTelemetry() {
  const telemetry = runtimeGateway.readTelemetry();
  if (telemetry !== null) {
    return telemetry;
  }
  const playable = readPlayableLoopState();
  return {
    sequenceId: 0,
    tick: 0,
    composition: {
      loadedWorld: null,
      fatalCount: 1,
      totalCount: 1,
      blocksLoad: true,
    },
    sessionHash: runtimeBackend.backendHash,
    acceptedCommandCount: 0,
    rejectedCommandCount: 0,
    restartCount: playable.currentEpoch.restartCount,
    replayRecords: [],
  };
}

function readAuthoredActorCapability(stableId, kind) {
  const definition = demoProjectContent.entityDefinitions.find(
    (candidate) => candidate.stableId === stableId,
  );
  const capability = definition?.capabilities.find((candidate) => candidate.kind === kind) ?? null;
  if (capability?.kind === 'transform') {
    return {
      kind: 'transform',
      position: capability.initial.position,
      yawDegrees: capability.initial.yawDegrees,
      pitchDegrees: capability.initial.pitchDegrees,
    };
  }
  if (capability?.kind === 'health') {
    return {
      kind: 'health',
      current: capability.current,
      max: capability.max,
      dead: capability.current <= 0,
    };
  }
  return capability;
}
}
