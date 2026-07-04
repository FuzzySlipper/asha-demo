import { mountAshaRendererBrowserSurface } from '@asha/renderer-three';
import { createMockRuntimeSession } from '@asha/runtime-bridge';

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

const runtimeSession = createMockRuntimeSession();
runtimeSession.initialize({
  sessionId: 'asha-demo.playable.collision',
  seed: 4103,
  project: {
    gameId: 'asha-demo',
    workspaceId: 'workspace.local',
  },
  projectBundle: {
    bundleSchemaVersion: 1,
    protocolVersion: 1,
    sceneId: 4103,
  },
});

const initialCameraPose = {
  position: [0, 1.62, 0],
  yawDegrees: 0,
  pitchDegrees: 0,
};
const collisionShape = { halfExtents: [0.25, 0.7, 0.25] };
const collisionPolicy = { mode: 'axis_separable_slide', maxIterations: 3 };
let runtimeCamera = createRuntimeCamera();

const surface = mountAshaRendererBrowserSurface(canvas, {
  autoStart: true,
  clearColor: 0x101820,
  controls: {
    initialPosition: initialCameraPose.position,
    movementAuthority: constrainCameraMovement,
  },
});

let health = 100;
let animationFrame = null;
let lastMovementEvent = 'Authority ready';
let reticlePulseTimer = null;

function createRuntimeCamera() {
  return runtimeSession.createCamera({
    initialPose: initialCameraPose,
    projection: {
      fovYDegrees: 55,
      near: 0.1,
      far: 100,
    },
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
    shape: collisionShape,
    policy: collisionPolicy,
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
  const result = surface.firePrimary();
  if (result.hit) {
    health = Math.max(0, health - 3);
    pulseReticle('hit');
  } else {
    pulseReticle('miss');
  }
  renderHud();
  return result;
}

function resetLoop() {
  health = 100;
  runtimeCamera = createRuntimeCamera();
  lastMovementEvent = 'Reset';
  surface.reset();
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
  const interaction = surface.interactionState();
  const movement = surface.movementState();
  const locked = surface.pointerLocked();

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
    eventState.textContent = movement.collided ? lastMovementEvent : interaction.lastEvent;
  }
  if (healthFill instanceof HTMLElement) {
    healthFill.style.width = `${health}%`;
  }
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
  interactionState: () => surface.interactionState(),
  movementState: () => surface.movementState(),
  pointerLocked: () => surface.pointerLocked(),
  reset: () => resetLoop(),
  runtimeTelemetry: () => runtimeSession.readTelemetry(),
  snapshot: () => surface.snapshot(),
};
