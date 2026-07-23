import {
  AshaAudioHost,
  AshaAnimationHost,
  AshaBillboardHost,
  AshaParticleHost,
  type AshaAnimationSampledCue,
  applyAshaRuntimeProjectionFrame,
  mountAshaRendererAnimatedMeshSurface,
} from '@asha/renderer-host';
import {
  cameraHandle,
  validateGeneratedWireValue,
  type GeneratedWireValue,
} from '@asha/contracts';
import {
  ResolvedPauseContextConsumer,
} from '@asha/runtime-bridge';
import type { RuntimeSessionGameplayCheckpoint } from '@asha/runtime-session';
import { hudControlToIntent } from '../input/hud-controls.js';
import { type DemoHudEventSource, type DemoMenuMode, projectHudView } from '../projection/hud-view.js';
import { createDemoRuntimeBackend, createDemoRuntimeGateway } from '../runtime/demo-runtime-gateway.js';
import {
  readDemoHudElements,
  reportDemoAuthorityPendingActions,
  reportDemoAuthorityPlayerPosition,
  reportDemoRendererProjection,
} from '../shell/hud-elements.js';
import { renderHudElements, renderSaveGameControls } from '../shell/hud-renderer.js';
import { pulseReticleElement } from '../shell/reticle-renderer.js';
import {
  loadDemoProjectContent,
  readDemoProjectContentStatus,
} from '../content/project-content.js';
import { createDemoPresentationResources } from '../content/presentation-resources.js';
import { createDemoParticleBillboardSink } from '../projection/particle-billboard-sink.js';

const DEMO_GAMEPLAY_SAVE_KEY = 'asha-demo.gameplay-save.v1';
const DEMO_GAMEPLAY_RESTORE_REQUEST_KEY = 'asha-demo.gameplay-restore-request.v1';
const DEMO_ENEMY_POLICY_CADENCE_MILLISECONDS = 1_500;

export async function bootGame() {
const elements = readDemoHudElements();
const canvas = elements.canvas;
const billboardLayer = elements.billboardLayer;
const reticle = elements.reticle;

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('ASHA renderer surface canvas is missing.');
}
if (!(billboardLayer instanceof HTMLElement)) {
  throw new Error('ASHA billboard projection layer is missing.');
}

const demoProjectContent = await loadDemoProjectContent();
const contentStatus = readDemoProjectContentStatus(demoProjectContent);
if (!contentStatus.valid) {
  throw new Error(`ASHA demo project content is invalid: ${contentStatus.diagnostics.join('; ')}`);
}

const runtimeBackend = await createDemoRuntimeBackend(demoProjectContent);
if (!runtimeBackend.available) {
  const message = runtimeBackend.diagnostics[0]?.message ?? 'Rust runtime project activation failed';
  throw new Error(message);
}
const runtimeGateway = createDemoRuntimeGateway(runtimeBackend);
const restoredGameplayAtBoot = restoreRequestedGameplayCheckpoint(runtimeGateway);
const launchSettings = runtimeBackend.launchSettings;
const presentationResources = createDemoPresentationResources(
  runtimeBackend.projectDocuments,
  demoProjectContent.projectSource,
);

let runtimeCamera = createRuntimeCamera();
reportDemoAuthorityPlayerPosition(canvas, runtimeCamera.pose.position);
let enemyPolicyTick = 0;
let menuMode: DemoMenuMode = restoredGameplayAtBoot ? 'paused' : 'title';
let lastMenuIntent = null;
let inputSettings = {
  invertY: false,
  lookSensitivityDegreesPerPixel: 0.1,
  moveSpeedUnitsPerSecond: 3,
};
const inputSession = runtimeGateway.inputSession();
const pauseContextConsumer = inputSession === null
  ? null
  : new ResolvedPauseContextConsumer(inputSession);
let lastProcessedInputSequence = -1;
let pointerLockWasActive = false;
let interactionCadenceFrame = 0;
let lastInteractionTarget = null;
const initialProjection = runtimeGateway.readProjection();

const surface = await mountAshaRendererAnimatedMeshSurface(canvas, {
  animatedMeshManifest: presentationResources.animatedMeshManifest,
  autoStart: true,
  clearColor: 0x101820,
  projection: launchSettings.cameraProjection,
  ...(initialProjection === null ? {} : { frame: initialProjection.frame }),
  controls: {
    initialPosition: readPlayerTransform().position,
    mouseSensitivity: (inputSettings.lookSensitivityDegreesPerPixel * Math.PI) / 180,
    moveSpeed: inputSettings.moveSpeedUnitsPerSecond,
    movementAuthority: constrainCameraMovement,
    ...(inputSession === null ? {} : { inputSession }),
  },
});
if (restoredGameplayAtBoot && inputSession !== null) {
  const restoredMenuContext = inputSession.applyInputContextCommand({
    operation: 'push',
    contextId: 'menu',
  });
  if (!restoredMenuContext.accepted) {
    throw new Error(
      `Saved game restored, but its pause menu context could not be rebuilt: ${restoredMenuContext.diagnostics[0]?.message ?? 'unknown input context rejection'}`,
    );
  }
}
const rendererProjection = surface.cameraProjection();
if (
  rendererProjection.fovYDegrees !== launchSettings.cameraProjection.fovYDegrees
  || rendererProjection.near !== launchSettings.cameraProjection.near
  || rendererProjection.far !== launchSettings.cameraProjection.far
) {
  throw new Error('Engine renderer did not retain the Rust-admitted camera projection');
}
reportDemoRendererProjection(canvas, rendererProjection.fovYDegrees);

let audioHost = createDemoAudioHost();
let animationHost = createDemoAnimationHost();
let billboardHost = createDemoBillboardHost();
let particleHost = createDemoParticleHost();
let lastAnimationProjectionStatus = {
  status: 'ready',
  authorityTick: null,
  applied: 0,
  diagnostics: [],
  origin: null,
  controller: null,
};
let lastAnimationSampledCueStatus = {
  status: 'waiting',
  cue: null,
  realization: null,
};
let lastAppliedRuntimeProjectionFingerprint: string | null = null;

const animationIntent = runtimeGateway.readAnimationIntent();

let animationFrame = null;
let enemyLoopTimer = null;
let lastEnemyPolicyReadout = null;
let lastGameplayTransform = null;
let lastEventSource: DemoHudEventSource = 'runtime';
let lastMovementEvent = 'Authority ready';
let lastRuntimeEvent = 'Runtime ready';
let reticlePulseTimer = null;
let lastCollisionReceipt = null;

function createRuntimeCamera() {
  const initialPose = readPlayerTransform();
  const fallbackCamera = {
    handle: -1,
    pose: initialPose,
  };
  if (!runtimeGateway.available() || launchSettings === null) {
    return fallbackCamera;
  }

  return runtimeGateway.createCamera({
    initialPose,
    projection: launchSettings.cameraProjection,
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

  const storedEnvironment = runtimeBackend.storedEnvironment;
  if (storedEnvironment?.status !== 'loaded') {
    lastMovementEvent = 'Movement blocked: stored environment collision unavailable';
    lastEventSource = 'movement';
    return {
      blockedAxes: ['x', 'y', 'z'],
      collided: true,
      movementHash: runtimeBackend.backendHash,
      pose: runtimeCamera.pose,
    };
  }

  const lifecycle = readLifecycleStatus();
  const paused = readAuthorityPaused();
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
  const lookScale = inputSettings.lookSensitivityDegreesPerPixel / 0.1;
  const yawDeltaDegrees = paused ? 0 : input.yawDeltaDegrees * lookScale;
  const pitchDeltaDegrees = paused
    ? 0
    : input.pitchDeltaDegrees * (inputSettings.invertY ? -1 : 1) * lookScale;
  const receipt = runtimeGateway.applyCollisionConstrainedCameraInput({
    camera: readRuntimeCameraHandle(),
    grid: storedEnvironment.grid,
    movementMode: runtimeBackend.launchSettings.movementMode,
    input: {
      moveForward: inputForAuthority.moveForward,
      moveRight: inputForAuthority.moveRight,
      moveUp: inputForAuthority.moveUp,
      yawDeltaDegrees,
      pitchDeltaDegrees,
      dtSeconds: input.dtSeconds,
      moveSpeedUnitsPerSecond: input.moveSpeedUnitsPerSecond * (inputSettings.moveSpeedUnitsPerSecond / 3),
    },
    tick: input.tick,
    shape: runtimeBackend.launchSettings.collisionShape,
    policy: runtimeBackend.launchSettings.collisionPolicy,
  });
  lastCollisionReceipt = receipt;
  runtimeCamera = receipt.snapshot.after;
  reportDemoAuthorityPlayerPosition(canvas, receipt.snapshot.after.pose.position);
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
  void audioHost?.dispose();
  animationHost.cleanup();
  particleHost?.dispose();
  billboardHost?.dispose();
  surface.dispose();
});

elements.lockButton?.addEventListener('click', () => {
  surface.lockPointer();
});

elements.fireButton?.addEventListener('click', () => {
  firePrimary();
});

elements.resetButton?.addEventListener('click', () => {
  handleHudControl('hud-restart');
});

elements.pauseButton?.addEventListener('click', () => {
  if (readAuthorityPaused()) {
    handleHudControl('hud-resume');
  } else {
    consumePauseAction('runtime.time.pause', 'shellControl');
  }
});

elements.resumeButton?.addEventListener('click', () => {
  handleHudControl('hud-resume');
});

elements.menuResetButton?.addEventListener('click', () => {
  handleHudControl('hud-restart');
});

elements.saveGameButton?.addEventListener('click', () => {
  saveCurrentGame();
});

elements.loadGameButton?.addEventListener('click', () => {
  requestSavedGameLoad();
});

elements.optionsButton?.addEventListener('click', () => {
  handleHudControl('hud-options');
});

elements.exitButton?.addEventListener('click', () => {
  handleHudControl('hud-exit');
});

elements.moveSpeedInput?.addEventListener('input', () => {
  updateInputSettings({ moveSpeedUnitsPerSecond: Number(elements.moveSpeedInput.value) });
});

elements.lookSensitivityInput?.addEventListener('input', () => {
  updateInputSettings({ lookSensitivityDegreesPerPixel: Number(elements.lookSensitivityInput.value) });
});

elements.invertYInput?.addEventListener('change', () => {
  updateInputSettings({ invertY: Boolean(elements.invertYInput.checked) });
});

syncSaveGameControls(
  restoredGameplayAtBoot ? 'Saved game restored through Rust authority.' : '',
);

function saveCurrentGame() {
  const receipt = runtimeGateway.saveGameplayCheckpoint();
  if (receipt === null || !receipt.accepted || receipt.checkpoint === null) {
    const message = receipt?.diagnostics[0]?.message ?? 'Rust gameplay checkpoint unavailable.';
    syncSaveGameControls(`Save failed: ${message}`);
    return;
  }
  try {
    window.localStorage.setItem(DEMO_GAMEPLAY_SAVE_KEY, JSON.stringify(receipt.checkpoint));
    syncSaveGameControls('Game saved. Project content remains in its normal project source.');
  } catch (error) {
    syncSaveGameControls(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requestSavedGameLoad() {
  if (window.localStorage.getItem(DEMO_GAMEPLAY_SAVE_KEY) === null) {
    syncSaveGameControls('No saved game is available.');
    return;
  }
  window.localStorage.setItem(DEMO_GAMEPLAY_RESTORE_REQUEST_KEY, 'requested');
  window.location.reload();
}

function syncSaveGameControls(message: string) {
  renderSaveGameControls(elements, {
    loadEnabled: window.localStorage.getItem(DEMO_GAMEPLAY_SAVE_KEY) !== null,
    message,
  });
}

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
    camera: readRuntimeCameraHandle(),
    tick: playable.counters.actionTick,
    source: 'browser_fps_pointer',
    pressed: true,
  });
  lastGameplayTransform = actionReceipt.gameplayTransform === undefined ? null : {
    ...actionReceipt.gameplayTransform,
    moduleRef: { moduleId: actionReceipt.gameplayTransform.moduleId },
    proposalHash: actionReceipt.gameplayTransform.decisionReceiptHash,
    validationStatus: actionReceipt.gameplayTransform.status,
  };

  if (actionReceipt.accepted && actionReceipt.combatReadout?.outcome.kind === 'hit') {
    const enemyHealth = readEnemyHealth();
    lastRuntimeEvent = enemyHealth.dead
      ? 'Tunnel sentinel defeated — objective complete'
      : `Hit confirmed — sentinel at ${enemyHealth.current}/${enemyHealth.max} health`;
    lastEventSource = 'runtime';
    pulseReticle('hit');
    if (enemyHealth.dead) {
      stopEnemyLoopCadence();
    }
  } else {
    lastRuntimeEvent = actionReceipt.accepted
      ? 'Shot missed — the sentinel is still advancing'
      : 'Fire rejected by runtime authority';
    lastEventSource = 'runtime';
    pulseReticle('miss');
  }
  void applyLatestRuntimeProjection();
  renderHud();
  return {
    interaction: readRuntimeInteractionState(),
    runtime: actionReceipt,
  };
}

let runtimeProjectionApplication: Promise<void> | null = null;
let runtimeProjectionPending = false;

function applyLatestRuntimeProjection(): Promise<void> {
  runtimeProjectionPending = true;
  if (runtimeProjectionApplication === null) {
    runtimeProjectionApplication = drainRuntimeProjectionApplications();
  }
  return runtimeProjectionApplication;
}

async function drainRuntimeProjectionApplications(): Promise<void> {
  try {
    while (runtimeProjectionPending) {
      runtimeProjectionPending = false;
      await applyLatestRuntimeProjectionNow();
    }
  } finally {
    runtimeProjectionApplication = null;
    if (runtimeProjectionPending) {
      void applyLatestRuntimeProjection();
    }
  }
}

async function applyLatestRuntimeProjectionNow() {
  const projection = runtimeGateway.readProjection();
  if (projection === null) {
    return;
  }
  const projectionFingerprint = JSON.stringify(projection.runtimeFrame);
  if (projectionFingerprint === lastAppliedRuntimeProjectionFingerprint) {
    return;
  }
  const animationOperation = projection.runtimeFrame.presentation.ops
    .filter((operation) => operation.domain === 'animation' && operation.op.op === 'update')
    .at(-1) ?? null;
  try {
    const listenerDiagnostics = audioHost === null ? [] : audioHost.updateListener({
      position: surface.cameraPose().position,
      forward: readAudioForward(surface.cameraPose()),
      up: [0, 1, 0],
    });
    const resumeDiagnostics = audioHost === null ? [] : await audioHost.resume();
    const receipt = await applyAshaRuntimeProjectionFrame(projection.runtimeFrame, {
      applyScene: (frame) => {
        surface.applyFrame(frame);
      },
      ...(audioHost === null ? {} : { audioHost }),
      ...(billboardHost === null ? {} : { billboardHost }),
      ...(particleHost === null ? {} : { particleHost }),
      animationHost,
    });
    lastAnimationProjectionStatus = {
      status: receipt.animation.diagnostics.length === 0 ? 'applied' : 'degraded',
      authorityTick: receipt.authorityTick,
      applied: receipt.animation.applied,
      diagnostics: [...receipt.animation.diagnostics],
      origin: animationOperation?.meta.origin ?? null,
      controller: animationOperation?.domain === 'animation' && animationOperation.op.op === 'update'
        ? animationOperation.op.controller
        : null,
    };
    const diagnostics = [
      ...listenerDiagnostics,
      ...resumeDiagnostics,
      ...receipt.audio.diagnostics,
      ...receipt.billboard.diagnostics,
      ...receipt.particle.diagnostics,
      ...receipt.animation.diagnostics,
    ];
    if (diagnostics.length > 0) {
      lastRuntimeEvent = `Presentation degraded: ${diagnostics[0]?.message ?? 'resource unavailable'}`;
      lastEventSource = 'runtime';
    }
    lastAppliedRuntimeProjectionFingerprint = projectionFingerprint;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    lastAnimationProjectionStatus = {
      status: 'failed',
      authorityTick: projection.runtimeFrame.authorityTick,
      applied: 0,
      diagnostics: [{
        code: 'hostFailure',
        handle: null,
        message,
        origin: animationOperation?.meta.origin ?? null,
        sequence: 0,
        target: null,
      }],
      origin: animationOperation?.meta.origin ?? null,
      controller: null,
    };
    lastRuntimeEvent = `Presentation failed: ${message}`;
    lastEventSource = 'runtime';
  }
  renderHud();
}
async function realizeAnimationSampledCue(cue: AshaAnimationSampledCue) {
  lastAnimationSampledCueStatus = {
    status: 'pending',
    cue,
    realization: null,
  };
  renderHud();
  if (cue.signal.domain !== 'particle' || particleHost === null) {
    lastAnimationSampledCueStatus = {
      status: 'degraded',
      cue,
      realization: {
        applied: 0,
        diagnostics: [{ code: 'unavailableHost', message: `${cue.signal.domain} cue host unavailable` }],
      },
    };
    renderHud();
    return;
  }
  const particleCue = presentationResources.particleCue(cue.signal.id);
  if (particleCue === null) {
    lastAnimationSampledCueStatus = {
      status: 'degraded',
      cue,
      realization: {
        applied: 0,
        diagnostics: [{
          code: 'missingCatalogCue',
          message: `No admitted particle cue is bound to ${cue.signal.id}`,
        }],
      },
    };
    renderHud();
    return;
  }
  const camera = surface.cameraPose();
  const cameraForward = readAudioForward(camera);
  const cuePosition: [number, number, number] = [
    camera.position[0] + cameraForward[0] * 0.75,
    camera.position[1] + cameraForward[1] * 0.75,
    camera.position[2] + cameraForward[2] * 0.75,
  ];
  const receipt = await particleHost.applyPresentation({
    replayScope: cue.replayScope,
    ops: [{
      domain: 'particle',
      meta: { sequence: 0, origin: cue.origin },
      op: {
        op: 'emit',
        signalId: cue.signal.id,
        descriptor: {
          anchor: { kind: 'world', position: cuePosition },
          sprite: {
            asset: particleCue.asset,
            contentHash: particleCue.contentHash,
            frameCount: 1,
          },
          ratePerSecond: 0,
          burstCount: 6,
          lifetimeSeconds: [6, 8],
          velocityMin: [-0.7, 0.3, -0.4],
          velocityMax: [0.7, 1.2, 0.4],
          acceleration: [0, -1.5, 0],
          sizeCurve: [
            { age: 0, value: 0.38 * particleCue.scale },
            { age: 1, value: 0 },
          ],
          colorCurve: [
            { age: 0, color: [0.45, 0.95, 1, 1] },
            { age: 1, color: [0.15, 0.45, 1, 0] },
          ],
          flipbookFramesPerSecond: 0,
          seed: 5_650,
          maxParticles: 8,
          visible: true,
        },
      },
    }],
  });
  lastAnimationSampledCueStatus = {
    status: receipt.diagnostics.length === 0 ? 'applied' : 'degraded',
    cue,
    realization: {
      applied: receipt.applied,
      diagnostics: [...receipt.diagnostics],
      readout: receipt.readout,
    },
  };
  renderHud();
}

function createDemoAudioHost() {
  if (!runtimeGateway.available() || globalThis.AudioContext === undefined) {
    return null;
  }
  try {
    return new AshaAudioHost({
      resolveResource: presentationResources.resolveAudioResource,
    });
  } catch {
    return null;
  }
}

function createDemoAnimationHost() {
  return new AshaAnimationHost(surface.animationProjection, {
    cues: presentationResources.animationCues,
  });
}

function createDemoBillboardHost() {
  if (!runtimeGateway.available()) {
    return null;
  }
  try {
    return new AshaBillboardHost({
      container: billboardLayer,
      resolveEntityPosition: resolveBillboardEntityPosition,
      projectWorld: projectBillboardWorldPoint,
      localize: (_key, fallback, argumentsByName) => Object.entries(argumentsByName).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, value),
        fallback,
      ),
    });
  } catch {
    return null;
  }
}

function createDemoParticleHost() {
  if (!runtimeGateway.available()) {
    return null;
  }
  try {
    return new AshaParticleHost({
      maxActiveEmitters: 32,
      maxParticles: 512,
      resolveEntityPosition: resolveBillboardEntityPosition,
      resolveResource: presentationResources.resolveParticleResource,
      sink: createDemoParticleBillboardSink(billboardLayer, projectBillboardWorldPoint),
    });
  } catch {
    return null;
  }
}

function resolveBillboardEntityPosition(entityId) {
  const entity = readEcrpRuntimeReadout().entities.find((candidate) => candidate.entity === entityId);
  const transform = entity?.capabilities.find((capability) => capability.kind === 'transform') ?? null;
  if (transform?.kind === 'transform') {
    return transform.position;
  }
  return null;
}

function projectBillboardWorldPoint(position) {
  return surface.projectWorldPoint(position);
}

function readAudioForward(pose) {
  const yaw = (Number(pose.yawDegrees ?? 0) * Math.PI) / 180;
  const pitch = (Number(pose.pitchDegrees ?? 0) * Math.PI) / 180;
  return [
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  ] as const;
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
  stopEnemyLoopCadence();
  if (!runtimeGateway.available()) {
    runtimeCamera = createRuntimeCamera();
    enemyPolicyTick = 0;
    lastEnemyPolicyReadout = null;
    lastCollisionReceipt = null;
    menuMode = 'title';
    lastMovementEvent = 'Reset unavailable: Rust runtime backend missing';
    lastRuntimeEvent = lastMovementEvent;
    lastEventSource = 'runtime';
    resetPresentationHostsForRuntimeRestart();
    surface.resetCamera();
    void applyLatestRuntimeProjection();
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
  if (restartReceipt?.accepted !== true) {
    lastRuntimeEvent = 'Restart rejected by runtime authority';
    lastEventSource = 'runtime';
    renderHud();
    return;
  }
  if (readAuthorityPaused()) {
    consumePauseAction('runtime.time.resume', 'shellControl', false);
  }
  runtimeCamera = createRuntimeCamera();
  enemyPolicyTick = 0;
  lastEnemyPolicyReadout = null;
  lastCollisionReceipt = null;
  menuMode = 'closed';
  lastMovementEvent = 'Reset';
  lastRuntimeEvent = 'Encounter started — defeat the tunnel sentinel';
  lastEventSource = 'runtime';
  resetPresentationHostsForRuntimeRestart();
  surface.resetCamera();
  void applyLatestRuntimeProjection().then(() => {
    restartEnemyLoopCadence();
  });
  pulseReticle('reset');
  renderHud();
}

function resetPresentationHostsForRuntimeRestart() {
  const previousAudioHost = audioHost;
  const previousBillboardHost = billboardHost;
  const previousParticleHost = particleHost;

  void previousAudioHost?.dispose();
  animationHost.cleanup();
  void previousBillboardHost?.dispose();
  previousParticleHost?.dispose();
  audioHost = createDemoAudioHost();
  animationHost = createDemoAnimationHost();
  billboardHost = createDemoBillboardHost();
  particleHost = createDemoParticleHost();
  lastAppliedRuntimeProjectionFingerprint = null;
}

function openPauseMenu(mode: DemoMenuMode) {
  stopEnemyLoopCadence();
  menuMode = mode;
  document.exitPointerLock?.();
  lastRuntimeEvent = mode === 'title' ? 'Returned to title' : 'Paused';
  lastEventSource = 'runtime';
  renderHud();
  return readRuntimeInteractionState();
}

function closePauseMenu() {
  menuMode = 'closed';
  lastRuntimeEvent = 'Resumed';
  lastEventSource = 'runtime';
  if (!readLifecycleStatus().player.dead && !readLifecycleStatus().enemy.dead) {
    restartEnemyLoopCadence();
  }
  renderHud();
  return readRuntimeInteractionState();
}

function readAuthorityPaused() {
  return runtimeGateway.readTimeControlState()?.mode === 'paused';
}

function consumePauseAction(actionOrId, source, projectMenu = true) {
  if (pauseContextConsumer === null) {
    lastRuntimeEvent = 'Pause blocked: Rust RuntimeSession input/time authority unavailable';
    lastEventSource = 'runtime';
    renderHud();
    return readRuntimeInteractionState();
  }
  const contextState = runtimeGateway.readInputContextState();
  const action = typeof actionOrId === 'string'
    ? {
        sequence: -1,
        actionId: actionOrId,
        contextId: contextState?.activeContexts.at(-1)?.contextId ?? 'gameplay',
        bindingId: `asha-demo.${source}.${actionOrId}`,
        phase: 'pressed',
        value: { kind: 'button', pressed: true },
      }
    : actionOrId;
  const receipt = pauseContextConsumer.consume(action);
  if (receipt === null) {
    return readRuntimeInteractionState();
  }
  if (!receipt.accepted) {
    lastRuntimeEvent = `Pause transition rejected: ${receipt.time?.rejection ?? receipt.context.diagnostics[0]?.message ?? 'unknown authority rejection'}`;
    lastEventSource = 'runtime';
    renderHud();
    return readRuntimeInteractionState();
  }
  if (!projectMenu) {
    return readRuntimeInteractionState();
  }
  return action.actionId === 'runtime.time.pause'
    ? openPauseMenu('paused')
    : closePauseMenu();
}

function drainResolvedInputDeliveries() {
  const readout = surface.inputReadout();
  if (readout === null) {
    return;
  }
  for (const delivery of readout.recentDeliveries) {
    if (delivery.sample.sequence <= lastProcessedInputSequence) {
      continue;
    }
    lastProcessedInputSequence = delivery.sample.sequence;
    const action = delivery.receipt.action;
    if (action === null) {
      continue;
    }
    if (action.actionId === 'runtime.time.pause' || action.actionId === 'runtime.time.resume') {
      consumePauseAction(action, 'browserResolvedAction');
      continue;
    }
    if (
      action.actionId === 'runtime.session.restart'
      && action.phase === 'pressed'
      && action.value.kind === 'button'
      && action.value.pressed
    ) {
      handleHudControl('hud-restart');
      continue;
    }
    if (
      action.actionId === 'demo.interact'
      && action.phase === 'pressed'
      && action.value.kind === 'button'
      && action.value.pressed
      && pointerLockWasActive
    ) {
      operateSecuritySwitch();
      continue;
    }
    if (
      action.actionId === 'gameplay.primaryFire'
      && action.phase === 'pressed'
      && action.value.kind === 'button'
      && action.value.pressed
      && pointerLockWasActive
    ) {
      firePrimary();
    }
  }
  pointerLockWasActive = readout.pointerLocked;
}

function operateSecuritySwitch() {
  if (menuMode !== 'closed' || readAuthorityPaused()) {
    return;
  }
  try {
    const receipt = runtimeGateway.submitInteraction();
    if (receipt === null) {
      lastRuntimeEvent = 'Interaction blocked: Rust gameplay authority unavailable';
    } else {
      lastRuntimeEvent = `Security switch accepted at ${receipt.distanceMillimeters} mm`;
      lastInteractionTarget = null;
      void applyLatestRuntimeProjection();
    }
  } catch (error) {
    lastRuntimeEvent = error instanceof Error ? error.message : String(error);
  }
  lastEventSource = 'runtime';
  renderHud();
}

function handleHudControl(controlId) {
  const intent = hudControlToIntent(controlId);
  if (intent === null) {
    return null;
  }
  lastMenuIntent = intent;
  if (intent.kind === 'ui.resume_intent') {
    if (menuMode === 'title') {
      return readRuntimeInteractionState();
    }
    return consumePauseAction('runtime.time.resume', 'shellControl');
  }
  if (intent.kind === 'runtime.restart_session_intent') {
    resetLoop();
    return readRuntimeInteractionState();
  }
  if (intent.kind === 'ui.open_options_intent') {
    return openPauseMenu('options');
  }
  if (intent.kind === 'ui.exit_to_menu_intent') {
    return openPauseMenu('title');
  }
  return null;
}

function updateInputSettings(update) {
  inputSettings = {
    ...inputSettings,
    ...(Number.isFinite(update.moveSpeedUnitsPerSecond)
      ? { moveSpeedUnitsPerSecond: clampInputSetting(update.moveSpeedUnitsPerSecond, 2, 6, 0.5) }
      : {}),
    ...(Number.isFinite(update.lookSensitivityDegreesPerPixel)
      ? { lookSensitivityDegreesPerPixel: clampInputSetting(update.lookSensitivityDegreesPerPixel, 0.05, 0.2, 0.01) }
      : {}),
    ...(typeof update.invertY === 'boolean' ? { invertY: update.invertY } : {}),
  };
  lastRuntimeEvent = 'Input settings updated';
  lastEventSource = 'runtime';
  renderHud();
}

function clampInputSetting(value, minimum, maximum, step) {
  const bounded = Math.min(maximum, Math.max(minimum, value));
  return Number((Math.round(bounded / step) * step).toFixed(2));
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

  const paused = readAuthorityPaused();
  renderHudElements(elements, projectHudView({
    backendMissingLabel: runtimeBackend.diagnostics[0]?.message ?? 'Rust runtime backend missing',
    gameplayChallenge: readGameplayChallenge(),
    enemyHealth,
    interaction,
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
    runtimeAvailable: runtimeGateway.available(),
    interactionTarget: lastInteractionTarget,
    animationPlayback: readAnimationHudPlayback(),
    animationSampledCue: lastAnimationSampledCueStatus,
  }));
}

function readAnimationPlayback() {
  if (animationIntent === null) {
    return null;
  }
  return surface.animatedMeshPlayback(animationIntent.instanceHandle);
}

function readAnimationHudPlayback() {
  const playback = readAnimationPlayback();
  const transition = lastAnimationProjectionStatus.controller?.transition;
  if (playback === null || transition === null || transition === undefined) {
    return playback;
  }
  return {
    ...playback,
    selectedClip: `${transition.fromStateId}>${transition.toStateId} blend ${transition.elapsedTicks}/${transition.durationTicks}`,
  };
}

function tickEnemyPolicy() {
  if (!runtimeGateway.available()) {
    lastRuntimeEvent = 'Enemy loop blocked: Rust runtime backend missing';
    lastEventSource = 'runtime';
    renderHud();
    return lastEnemyPolicyReadout;
  }

  const paused = readAuthorityPaused();
  if (paused || menuMode !== 'closed') {
    stopEnemyLoopCadence();
    lastRuntimeEvent = menuMode === 'title' ? 'Choose Start when ready' : 'Encounter paused';
    lastEventSource = 'runtime';
    renderHud();
    return lastEnemyPolicyReadout;
  }
  const playerHealthBefore = readPlayerHealth();
  const encounterTick = runtimeGateway.readPlayableEncounterTick({
    targetCamera: readRuntimeCameraHandle(),
    targetPosition: runtimeCamera.pose.position,
    tick: enemyPolicyTick,
    shell: {
      paused,
    },
  });
  if (encounterTick.status === 'blocked') {
    lastRuntimeEvent = encounterTick.blockedReason === 'enemy_dead' && lastGameplayTransform !== null
      ? `Enemy defeated - ${lastGameplayTransform.moduleRef.moduleId}`
      : encounterTickBlockedEvent(encounterTick.blockedReason);
    lastEventSource = 'runtime';
    if (encounterTick.blockedReason === 'enemy_dead' || encounterTick.blockedReason === 'player_dead') {
      stopEnemyLoopCadence();
    }
    renderHud();
    return lastEnemyPolicyReadout;
  }

  enemyPolicyTick += 1;
  const readout = encounterTick.autonomousPolicy;
  lastEnemyPolicyReadout = readout;

  if (encounterTick.combatSummary?.status === 'accepted') {
    const playerHealthAfter = readPlayerHealth();
    const damage = Math.max(0, playerHealthBefore.current - playerHealthAfter.current);
    lastRuntimeEvent = `Sentinel attacks — ${damage} damage, ${playerHealthAfter.current}/${playerHealthAfter.max} health remaining`;
    lastEventSource = 'runtime';
  } else if (encounterTick.movementSummary?.status === 'accepted') {
    lastRuntimeEvent = 'The tunnel sentinel is advancing';
    lastEventSource = 'runtime';
  }
  if (encounterTick.lifecycleAfter?.player.dead) {
    lastRuntimeEvent = 'Player defeated — press R or choose Restart';
    lastEventSource = 'runtime';
    stopEnemyLoopCadence();
  }
  void applyLatestRuntimeProjection();
  renderHud();
  return readout;
}

function restartEnemyLoopCadence() {
  stopEnemyLoopCadence();
  if (menuMode !== 'closed' || readAuthorityPaused()) {
    return;
  }
  enemyLoopTimer = window.setInterval(() => {
    tickEnemyPolicy();
  }, DEMO_ENEMY_POLICY_CADENCE_MILLISECONDS);
}

function stopEnemyLoopCadence() {
  if (enemyLoopTimer === null) {
    return;
  }
  window.clearInterval(enemyLoopTimer);
  enemyLoopTimer = null;
}

function readRuntimeCameraHandle() {
  if (typeof runtimeCamera === 'number') {
    return cameraHandle(runtimeCamera);
  }
  return cameraHandle('handle' in runtimeCamera ? runtimeCamera.handle : runtimeCamera.camera);
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
  const paused = readAuthorityPaused();
  return {
    actionTick: playable.counters.actionTick,
    canFire: playable.commands.canFire,
    fireBlockedReasons: [...playable.commands.blockedReasons],
    hits: playable.counters.hits,
    lastEvent: lastRuntimeEvent,
    lastMenuIntent,
    lifecycleOutcome: readLifecycleStatus().outcome.kind,
    gameplayTransform: lastGameplayTransform,
    gameplayChallenge: readGameplayChallenge(),
    inputSettings: { ...inputSettings },
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

function readGameplayChallenge() {
  const state = runtimeGateway.readGameplayChallengeState();
  const objectivePoints = readChallengeObjectivePoints();
  if (state === null) {
    return {
      status: 'unavailable',
      score: 0,
      objectivePoints,
      closeRangeHits: 0,
      triggerEntries: 0,
    };
  }
  return {
    status: state.status,
    score: state.score,
    closeRangeHits: state.closeRangeHits,
    triggerEntries: state.triggerEntries,
    objectivePoints: state.objectivePoints ?? objectivePoints,
  };
}

function readChallengeObjectivePoints() {
  const gameplayDocument = runtimeBackend.projectDocuments.find(
    (document) => document.kind === 'gameplayConfiguration',
  );
  if (gameplayDocument?.kind !== 'gameplayConfiguration') return 0;
  const configuration = gameplayDocument.document.configurations.find(
    (candidate) => candidate.configurationId === 'demo.primary-fire-effect.default',
  );
  const value = configuration?.values.find(
    (candidate) => candidate.fieldId === 'objectivePoints',
  )?.value;
  return value?.kind === 'integer' ? value.value : 0;
}

function readPlayableLoopState() {
  const paused = readAuthorityPaused();
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
    position: [0, 0, 0],
    yawDegrees: 0,
    pitchDegrees: 0,
  };
}

function readPlayerTransform() {
  const playerDefinition = launchSettings?.playerEntityDefinition;
  if (playerDefinition === undefined) {
    throw new Error('Rust-admitted Demo launch settings have no player entity definition');
  }
  const transform = readActorCapability(playerDefinition, 'transform');
  if (transform === null) {
    throw new Error(`Rust-admitted player entity definition ${playerDefinition} was not instantiated`);
  }
  return {
    position: transform.position,
    yawDegrees: transform.yawDegrees,
    pitchDegrees: transform.pitchDegrees,
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
  drainResolvedInputDeliveries();
  interactionCadenceFrame += 1;
  if (runtimeGateway.available() && interactionCadenceFrame % 6 === 0) {
    const composedRuntime = runtimeGateway.readComposedRuntimeSession();
    if (composedRuntime !== null) {
      reportDemoAuthorityPendingActions(
        canvas,
        composedRuntime.gameplay.schedulerPendingActionCount,
        composedRuntime.gameplay.schedulerOutstandingDispatchCount,
        runtimeGateway.readTimeControlState()?.authorityTick ?? -1,
      );
    }
  }
  if (runtimeGateway.available() && menuMode === 'closed' && !readAuthorityPaused()) {
    try {
      if (interactionCadenceFrame % 2 === 0) {
        runtimeGateway.advanceFixedTick();
        void applyLatestRuntimeProjection();
      }
      if (interactionCadenceFrame % 6 === 0) {
        lastInteractionTarget = runtimeGateway.readInteractionTarget();
      }
    } catch (error) {
      lastRuntimeEvent = error instanceof Error ? error.message : String(error);
      lastEventSource = 'runtime';
    }
  } else {
    lastInteractionTarget = null;
  }
  billboardHost?.refreshLayout();
  particleHost?.advance(1 / 60);
  const animationReceipt = animationHost.advance(1 / 60);
  for (const cue of animationReceipt.cues) {
    void realizeAnimationSampledCue(cue);
  }
  renderHud();
  animationFrame = window.requestAnimationFrame(tickHud);
}

if (!restoredGameplayAtBoot || !readAuthorityPaused()) {
  consumePauseAction('runtime.time.pause', 'startup', false);
}
menuMode = restoredGameplayAtBoot ? 'paused' : 'title';
lastRuntimeEvent = restoredGameplayAtBoot
  ? 'Saved game restored — resume when ready'
  : 'Choose Start when ready';
lastEventSource = 'runtime';
renderHud();
tickHud();

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
      sceneId: demoProjectContent.projectManifest.entryScene,
      bundleSchemaVersion: demoProjectContent.projectManifest.bundleSchemaVersion,
      protocolVersion: demoProjectContent.projectManifest.protocolVersion,
      resetHash: runtimeBackend.backendHash,
    },
    hashes: {
      lifecycleHash: runtimeBackend.backendHash,
      playerHealthHash: 'missing-rust-backend:player-health',
      enemyHealthHash: 'missing-rust-backend:enemy-health',
      replayHash: runtimeBackend.backendHash,
    },
    nonClaims: ['not_ui_authority', 'not_demo_local_lifecycle'],
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
  const document = runtimeBackend.projectDocuments.find(
    (candidate) => candidate.kind === 'entityDefinition'
      && candidate.definition.stableId === stableId,
  );
  const capability = document?.kind === 'entityDefinition'
    ? document.definition.capabilities.find((candidate) => candidate.kind === kind) ?? null
    : null;
  if (capability?.kind === 'transform') {
    return {
      kind: 'transform',
      position: capability.transform.translation,
      yawDegrees: 0,
      pitchDegrees: 0,
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
  return null;
}
}

function restoreRequestedGameplayCheckpoint(
  runtimeGateway: ReturnType<typeof createDemoRuntimeGateway>,
): boolean {
  const requested = window.localStorage.getItem(DEMO_GAMEPLAY_RESTORE_REQUEST_KEY) !== null;
  if (!requested) {
    return false;
  }
  window.localStorage.removeItem(DEMO_GAMEPLAY_RESTORE_REQUEST_KEY);
  const stored = window.localStorage.getItem(DEMO_GAMEPLAY_SAVE_KEY);
  if (stored === null) {
    throw new Error('Load requested, but no saved gameplay checkpoint exists.');
  }

  let decoded: GeneratedWireValue;
  try {
    decoded = JSON.parse(stored) as GeneratedWireValue;
  } catch (error) {
    throw new Error(
      `Saved gameplay checkpoint is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const validation = validateGeneratedWireValue(
    'projectBundle.RuntimeProjectGameplayCheckpoint',
    decoded,
  );
  if (validation.valid === false) {
    throw new Error(
      `Saved gameplay checkpoint is malformed at ${validation.issue.path}: ${validation.issue.message}`,
    );
  }

  const receipt = runtimeGateway.restoreGameplayCheckpoint(
    decoded as unknown as RuntimeSessionGameplayCheckpoint,
  );
  if (receipt === null || !receipt.accepted) {
    const message = receipt?.diagnostics[0]?.message ?? 'Rust gameplay restore unavailable.';
    throw new Error(`Saved gameplay checkpoint was rejected: ${message}`);
  }
  return true;
}
