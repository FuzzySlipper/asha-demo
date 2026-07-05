import { mountAshaRendererBrowserSurface } from '@asha/renderer-three';
import { createMockRuntimeSession } from '@asha/runtime-bridge/reference';
import {
  demoProjectContent,
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
const lockButton = document.querySelector('#lock-button');
const fireButton = document.querySelector('#fire-button');
const resetButton = document.querySelector('#reset-button');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('ASHA renderer surface canvas is missing.');
}

const contentStatus = readDemoProjectContentStatus();
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

const surface = mountAshaRendererBrowserSurface(canvas, {
  autoStart: true,
  clearColor: 0x101820,
  controls: {
    initialPosition: demoProjectContent.runtime.initialCameraPose.position,
    movementAuthority: constrainCameraMovement,
  },
});

let animationFrame = null;
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
  const receipt = runtimeSession.applyCollisionConstrainedCameraInput({
    camera: runtimeCamera,
    grid: 1,
    input: {
      moveForward: input.moveForward,
      moveRight: input.moveRight,
      moveUp: input.moveUp,
      yawDeltaDegrees: input.yawDeltaDegrees,
      pitchDeltaDegrees: input.pitchDeltaDegrees,
      dtSeconds: input.dtSeconds,
      moveSpeedUnitsPerSecond: input.moveSpeedUnitsPerSecond,
    },
    tick: input.tick,
    shape: demoProjectContent.runtime.collisionShape,
    policy: demoProjectContent.runtime.collisionPolicy,
  });
  lastMovementEvent = receipt.collided
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

document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !surface.pointerLocked()) {
    return;
  }
  event.preventDefault();
  firePrimary();
});

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && surface.pointerLocked()) {
    event.preventDefault();
    firePrimary();
  } else if (event.code === 'KeyR') {
    event.preventDefault();
    resetLoop();
  }
});

function firePrimary() {
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

  if (actionReceipt.accepted && actionReceipt.combatReadout?.outcome.kind === 'hit') {
    lastRuntimeEvent = 'Fire hit';
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
  lastMovementEvent = 'Reset';
  lastRuntimeEvent = restartReceipt.accepted ? 'Runtime reset' : 'Reset rejected';
  surface.reset();
  projectRuntimeTargetState();
  pulseReticle('reset');
  renderHud();
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
  const movement = surface.movementState();
  const locked = surface.pointerLocked();
  const enemyHealth = readEnemyHealth();

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
  if (poseState instanceof HTMLElement) {
    poseState.textContent = `${pose.position[0].toFixed(1)}, ${pose.position[2].toFixed(1)} | ${Math.round(
      pose.yawDegrees,
    )}`;
  }
  if (eventState instanceof HTMLElement) {
    eventState.textContent = movement.collided ? lastMovementEvent : lastRuntimeEvent || interaction.lastEvent;
  }
  if (healthFill instanceof HTMLElement) {
    healthFill.style.width = `${enemyHealth.percent}%`;
  }
}

function projectRuntimeTargetState() {
  const enemyHealth = readEnemyHealth();
  surface.projectTargetProjection({
    visible: !enemyHealth.dead,
    lastEvent: enemyHealth.dead ? 'Enemy defeated' : lastRuntimeEvent,
  });
}

function readRuntimeInteractionState() {
  const lifecycle = runtimeSession.readLifecycleStatus();
  const replayRecords = runtimeSession.readTelemetry().replayRecords;
  const latestRestartIndex = replayRecords.findLastIndex(
    (record) => record.kind === 'restart' || record.kind === 'requestSessionRestart',
  );
  const currentEpochRecords = latestRestartIndex === -1 ? replayRecords : replayRecords.slice(latestRestartIndex + 1);
  const shotsFired = currentEpochRecords.filter(
    (record) => record.kind === 'submitRuntimeActionIntent',
  ).length;
  const enemyDead = lifecycle.enemy.dead;
  return {
    hits: enemyDead ? 1 : 0,
    lastEvent: lastRuntimeEvent,
    remainingTargets: enemyDead ? 0 : 1,
    shotsFired,
    targetHealth: lifecycle.enemy.health.current,
    totalTargets: 1,
  };
}

function readEnemyHealth() {
  const readout = runtimeSession.readEcrpRuntimeReadout();
  const enemy = readout.entities.find(
    (entity) => entity.definitionStableId === 'actor/generated-tunnel-enemy',
  );
  const health = enemy?.capabilities.find(
    (capability) => capability.kind === 'health',
  );
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

function tickHud() {
  renderHud();
  animationFrame = window.requestAnimationFrame(tickHud);
}

renderHud();
tickHud();

globalThis.ashaRendererSurface = {
  kind: surface.kind,
  cameraPose: () => surface.cameraPose(),
  firePrimary: () => firePrimary(),
  interactionState: () => readRuntimeInteractionState(),
  movementState: () => surface.movementState(),
  pointerLocked: () => surface.pointerLocked(),
  projectContentStatus: () => ({
    ...readDemoProjectContentStatus(),
    runtimeLoaded: ecrpProjectLoadReceipt.accepted,
    runtimeBootstrapHash: ecrpProjectLoadReceipt.bootstrapHash,
  }),
  reset: () => resetLoop(),
  runtimeEcrpReadout: () => runtimeSession.readEcrpRuntimeReadout(),
  runtimeTelemetry: () => runtimeSession.readTelemetry(),
  snapshot: () => surface.snapshot(),
};
