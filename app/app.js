import {
  createAshaRendererGeneratedTunnelRoomSurfaceFrame,
  mountAshaRendererBrowserSurface,
} from '@asha/renderer-three';
import { createMockRuntimeSession } from '@asha/runtime-bridge/reference';
import {
  loadDemoProjectContent,
  readDemoProjectContentStatus,
} from './project-content.js';

const canvas = document.querySelector('#asha-render-surface');
const reticle = document.querySelector('#reticle');
const lockState = document.querySelector('#lock-state');
const targetState = document.querySelector('#target-state');
const shotState = document.querySelector('#shot-state');
const poseState = document.querySelector('#pose-state');
const eventState = document.querySelector('#event-state');
const healthFill = document.querySelector('#health-fill');
const playerHealthState = document.querySelector('#player-health-state');
const playerHealthFill = document.querySelector('#player-health-fill');
const deathState = document.querySelector('#death-state');
const lockButton = document.querySelector('#lock-button');
const fireButton = document.querySelector('#fire-button');
const pauseButton = document.querySelector('#pause-button');
const resetButton = document.querySelector('#reset-button');
const pauseMenu = document.querySelector('#pause-menu');
const pauseMenuStatus = document.querySelector('#pause-menu-status');
const resumeButton = document.querySelector('#resume-button');
const menuResetButton = document.querySelector('#menu-reset-button');
const optionsButton = document.querySelector('#options-button');
const exitButton = document.querySelector('#exit-button');
const optionsPane = document.querySelector('#options-pane');
const exitState = document.querySelector('#exit-state');

function hudControlToIntent(controlId) {
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

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('ASHA renderer surface canvas is missing.');
}

const demoProjectContent = await loadDemoProjectContent();
const contentStatus = readDemoProjectContentStatus(demoProjectContent);
if (!contentStatus.valid) {
  throw new Error(`ASHA demo project content is invalid: ${contentStatus.diagnostics.join('; ')}`);
}

const runtimeSession = createMockRuntimeSession();
runtimeSession.initialize({
  sessionId: demoProjectContent.runtime.sessionId,
  seed: demoProjectContent.runtime.seed,
  project: demoProjectContent.projectBundle.project,
  projectBundle: demoProjectContent.projectBundle.runtimeRequest,
});
const ecrpProjectLoadReceipt = runtimeSession.loadEcrpProject({
  kind: 'runtime_session.load_ecrp_project.v0',
  projectBundle: demoProjectContent.projectBundle,
  entityDefinitions: demoProjectContent.entityDefinitions,
  sceneDocument: demoProjectContent.sceneDocument,
});
if (!ecrpProjectLoadReceipt.accepted) {
  throw new Error(
    `ASHA RuntimeSession rejected demo ECRP project content: ${ecrpProjectLoadReceipt.diagnostics
      .map((diagnostic) => `${diagnostic.code}:${diagnostic.path}`)
      .join('; ')}`,
  );
}

let runtimeCamera = createRuntimeCamera();
let runtimeActionTick = 0;
let enemyPolicyTick = 0;
let playerHits = 0;
let playerShotsFired = 0;
let restartCount = 0;
let paused = false;
let menuMode = 'closed';
let lastMenuIntent = null;
const generatedTunnelReadout = runtimeSession.readGeneratedTunnelReadout({
  presetId: demoProjectContent.catalogs.levelPreset.presetId,
  seed: demoProjectContent.catalogs.levelPreset.seed,
});
const levelFrame = createAshaRendererGeneratedTunnelRoomSurfaceFrame({
  tunnel: generatedTunnelReadout,
  enemy: demoProjectContent.runtime.enemyRenderTarget,
});

const surface = mountAshaRendererBrowserSurface(canvas, {
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
let lastMovementEvent = 'Authority ready';
let lastRuntimeEvent = 'Runtime ready';
let reticlePulseTimer = null;

function createRuntimeCamera() {
  return runtimeSession.createCamera({
    initialPose: demoProjectContent.runtime.initialCameraPose,
    projection: demoProjectContent.runtime.cameraProjection,
    viewport: {
      width: canvas.clientWidth || 1280,
      height: canvas.clientHeight || 720,
    },
  }).snapshot.camera;
}

function constrainCameraMovement(input) {
  const lifecycle = runtimeSession.readLifecycleStatus();
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
  const receipt = runtimeSession.applyCollisionConstrainedCameraInput({
    camera: runtimeCamera,
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
  lastMovementEvent = paused
    ? 'Movement paused'
    : lifecycle.player.dead
      ? 'Movement blocked: player defeated'
      : receipt.collided
        ? `Blocked ${receipt.blockedAxes.join(', ')}`
        : 'Moved';
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

lockButton?.addEventListener('click', () => {
  surface.lockPointer();
});

fireButton?.addEventListener('click', () => {
  firePrimary();
});

resetButton?.addEventListener('click', () => {
  resetLoop();
});

pauseButton?.addEventListener('click', () => {
  if (paused) {
    handleHudControl('hud-resume');
  } else {
    openPauseMenu('paused');
  }
});

resumeButton?.addEventListener('click', () => {
  handleHudControl('hud-resume');
});

menuResetButton?.addEventListener('click', () => {
  handleHudControl('hud-restart');
});

optionsButton?.addEventListener('click', () => {
  handleHudControl('hud-options');
});

exitButton?.addEventListener('click', () => {
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
  const lifecycle = runtimeSession.readLifecycleStatus();
  if (paused || lifecycle.player.dead) {
    lastRuntimeEvent = paused ? 'Fire blocked: paused' : 'Fire blocked: player defeated';
    pulseReticle('miss');
    renderHud();
    return {
      interaction: readRuntimeInteractionState(),
      runtime: null,
    };
  }

  const actionReceipt = runtimeSession.submitRuntimeActionIntent({
    kind: 'runtime_action_intent.v0',
    action: 'primary_fire',
    phase: 'pressed',
    camera: runtimeCamera,
    tick: runtimeActionTick,
    source: 'browser_fps_pointer',
    pressed: true,
  });
  runtimeActionTick += 1;
  playerShotsFired += 1;

  if (actionReceipt.accepted && actionReceipt.combatReadout?.outcome.kind === 'hit') {
    lastRuntimeEvent = 'Fire hit';
    playerHits += 1;
    pulseReticle('hit');
  } else {
    lastRuntimeEvent = actionReceipt.accepted ? 'Fire missed' : 'Fire rejected';
    pulseReticle('miss');
  }
  projectRuntimeTargetState();
  renderHud();
  return {
    interaction: readRuntimeInteractionState(),
    runtime: actionReceipt,
  };
}

function resetLoop() {
  const statusBefore = runtimeSession.readLifecycleStatus();
  const restartReceipt = runtimeSession.requestSessionRestart({
    kind: 'runtime.restart_session_intent',
    source: 'hud_menu',
    requireTerminal: false,
    expectedSessionHash: statusBefore.sessionHash,
  });
  runtimeCamera = createRuntimeCamera();
  runtimeActionTick = 0;
  enemyPolicyTick = 0;
  playerHits = 0;
  playerShotsFired = 0;
  lastEnemyPolicyReadout = null;
  restartCount = restartReceipt.restart?.restartCount ?? restartCount;
  paused = false;
  menuMode = 'closed';
  lastMovementEvent = 'Reset';
  lastRuntimeEvent = restartReceipt.accepted ? 'Runtime reset' : 'Reset rejected';
  surface.reset();
  projectRuntimeTargetState();
  pulseReticle('reset');
  renderHud();
}

function openPauseMenu(mode) {
  paused = true;
  menuMode = mode;
  document.exitPointerLock?.();
  lastRuntimeEvent = mode === 'exit' ? 'Exited to menu' : 'Paused';
  renderHud();
  return readRuntimeInteractionState();
}

function closePauseMenu() {
  paused = false;
  menuMode = 'closed';
  lastRuntimeEvent = 'Resumed';
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
  if (!(reticle instanceof HTMLElement)) {
    return;
  }
  reticle.dataset.state = kind;
  window.clearTimeout(reticlePulseTimer);
  reticlePulseTimer = window.setTimeout(() => {
    reticle.dataset.state = 'idle';
  }, 140);
}

function renderHud() {
  const pose = surface.cameraPose();
  const interaction = readRuntimeInteractionState();
  const lifecycle = runtimeSession.readLifecycleStatus();
  const movement = surface.movementState();
  const locked = surface.pointerLocked();
  const enemyHealth = readEnemyHealth();
  const playerHealth = readPlayerHealth();

  if (lockState instanceof HTMLElement) {
    lockState.textContent = locked ? 'LOCKED' : 'UNLOCKED';
    lockState.dataset.locked = String(locked);
  }
  if (targetState instanceof HTMLElement) {
    targetState.textContent = `${interaction.remainingTargets}/${interaction.totalTargets}`;
  }
  if (shotState instanceof HTMLElement) {
    shotState.textContent = `${interaction.hits}/${interaction.shotsFired}`;
  }
  if (playerHealthState instanceof HTMLElement) {
    playerHealthState.textContent = `${playerHealth.current}/${playerHealth.max}`;
    playerHealthState.dataset.dead = String(lifecycle.player.dead);
  }
  if (poseState instanceof HTMLElement) {
    poseState.textContent = `${pose.position[0].toFixed(1)}, ${pose.position[2].toFixed(1)} | ${Math.round(
      pose.yawDegrees,
    )}`;
  }
  if (eventState instanceof HTMLElement) {
    eventState.textContent = lifecycle.player.dead
      ? `${lifecycle.outcome.label} - restart available`
      : movement.collided
        ? lastMovementEvent
        : lastRuntimeEvent || interaction.lastEvent;
  }
  if (healthFill instanceof HTMLElement) {
    healthFill.style.width = `${enemyHealth.percent}%`;
  }
  if (playerHealthFill instanceof HTMLElement) {
    playerHealthFill.style.width = `${playerHealth.percent}%`;
  }
  if (deathState instanceof HTMLElement) {
    deathState.hidden = !lifecycle.player.dead;
  }
  if (fireButton instanceof HTMLButtonElement) {
    fireButton.disabled = paused || lifecycle.player.dead;
    fireButton.dataset.blocked = String(paused || lifecycle.player.dead);
  }
  if (pauseButton instanceof HTMLButtonElement) {
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
  }
  if (pauseMenu instanceof HTMLElement) {
    pauseMenu.hidden = menuMode === 'closed';
    pauseMenu.dataset.mode = menuMode;
  }
  if (pauseMenuStatus instanceof HTMLElement) {
    pauseMenuStatus.textContent =
      menuMode === 'exit'
        ? 'Exited to menu. Resume or restart when ready.'
        : menuMode === 'options'
          ? 'Options are read-only for this demo build.'
          : 'Runtime paused. Resume or restart through typed HUD intents.';
  }
  if (resumeButton instanceof HTMLButtonElement) {
    resumeButton.disabled = lifecycle.player.dead;
  }
  if (optionsPane instanceof HTMLElement) {
    optionsPane.hidden = menuMode !== 'options';
  }
  if (exitState instanceof HTMLElement) {
    exitState.hidden = menuMode !== 'exit';
  }
}

function projectRuntimeTargetState() {
  const enemyHealth = readEnemyHealth();
  const enemyTransform = readEnemyTransform();
  surface.projectTargetProjection({
    visible: !enemyHealth.dead,
    position: enemyTransform.position,
    scale: demoProjectContent.runtime.enemyRenderTarget.scale,
    lastEvent: enemyHealth.dead ? 'Enemy defeated' : lastRuntimeEvent,
  });
}

function tickEnemyPolicy() {
  const lifecycle = runtimeSession.readLifecycleStatus();
  if (paused) {
    renderHud();
    return lastEnemyPolicyReadout;
  }
  if (lifecycle.enemy.dead || lifecycle.player.dead) {
    if (lifecycle.player.dead) {
      lastRuntimeEvent = 'Player defeated';
      renderHud();
    }
    return lastEnemyPolicyReadout;
  }

  const enemyTransform = readEnemyTransform();
  const targetPose = surface.cameraPose();
  const readout = runtimeSession.runAutonomousPolicyTick({
    targetCamera: runtimeCamera,
    tick: enemyPolicyTick,
    enemy: {
      id: 'generated-tunnel.enemy.1',
      position: enemyTransform.position,
    },
    target: {
      id: 'generated-tunnel.player',
      position: targetPose.position,
    },
    combat: {
      primaryFireRangeUnits: 2.4,
      lineOfSight: 'clear',
    },
  });
  enemyPolicyTick += 1;
  lastEnemyPolicyReadout = readout;

  if (readout.combatSummary?.status === 'accepted') {
    lastRuntimeEvent = 'Enemy hit';
  } else if (readout.movementSummary?.status === 'accepted') {
    lastRuntimeEvent = 'Enemy moved';
  }
  const lifecycleAfter = runtimeSession.readLifecycleStatus();
  if (lifecycleAfter.player.dead) {
    lastRuntimeEvent = 'Player defeated';
  }
  projectRuntimeTargetState();
  renderHud();
  return readout;
}

function readRuntimeInteractionState() {
  const lifecycle = runtimeSession.readLifecycleStatus();
  const enemyDead = lifecycle.enemy.dead;
  return {
    actionTick: runtimeActionTick,
    hits: playerHits,
    lastEvent: lastRuntimeEvent,
    lastMenuIntent,
    lifecycleOutcome: lifecycle.outcome.kind,
    menuMode,
    paused,
    playerDead: lifecycle.player.dead,
    playerHealth: lifecycle.player.health.current,
    restartCount,
    remainingTargets: enemyDead ? 0 : 1,
    shotsFired: playerShotsFired,
    targetHealth: lifecycle.enemy.health.current,
    totalTargets: 1,
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
  const readout = runtimeSession.readEcrpRuntimeReadout();
  const enemy = readout.entities.find(
    (entity) => entity.definitionStableId === stableId,
  );
  return enemy?.capabilities.find((capability) => capability.kind === kind) ?? null;
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

globalThis.ashaRendererSurface = {
  kind: surface.kind,
  cameraPose: () => surface.cameraPose(),
  firePrimary: () => firePrimary(),
  enemyLoopState: () => lastEnemyPolicyReadout,
  interactionState: () => readRuntimeInteractionState(),
  movementState: () => surface.movementState(),
  pointerLocked: () => surface.pointerLocked(),
  projectContentStatus: () => ({
    ...readDemoProjectContentStatus(demoProjectContent),
    levelRenderProjectionHash: generatedTunnelReadout.renderProjection.hash,
    levelSurfaceLabels: ['generated-tunnel-floor', demoProjectContent.runtime.enemyRenderTarget.label],
    runtimeLoaded: ecrpProjectLoadReceipt.accepted,
    runtimeBootstrapHash: ecrpProjectLoadReceipt.bootstrapHash,
  }),
  reset: () => resetLoop(),
  runtimeEcrpReadout: () => runtimeSession.readEcrpRuntimeReadout(),
  runtimeTelemetry: () => runtimeSession.readTelemetry(),
  snapshot: () => surface.snapshot(),
  tickEnemyPolicy: () => tickEnemyPolicy(),
};
