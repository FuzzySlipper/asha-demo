import {
  AshaAudioHost,
  AshaAnimationHost,
  AshaBillboardHost,
  AshaParticleHost,
  type AshaAnimationSampledCue,
  applyAshaRuntimeProjectionFrame,
  createAshaRendererGeneratedTunnelRoomSurfaceFrame,
  mountAshaRendererAnimatedMeshSurface,
} from '@asha/renderer-host';
import {
  billboardHandle,
  cameraHandle,
} from '@asha/contracts';
import {
  ResolvedPauseContextConsumer,
  buildRuntimeSessionAnimationControllerTargetFrame,
} from '@asha/runtime-bridge';
import { TINY_GENERATED_TUNNEL_READOUT } from '@asha/runtime-session';
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
import { resolveDemoAudioResource } from '../content/audio-resources.js';
import {
  PRIMARY_FIRE_SPRITE_ASSET,
  PRIMARY_FIRE_SPRITE_CONTENT_HASH,
  resolveDemoParticleResource,
} from '../content/particle-resources.js';
import { createDemoParticleBillboardSink } from '../projection/particle-billboard-sink.js';

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
const runtimeGateway = createDemoRuntimeGateway(runtimeBackend);
const ecrpProjectLoadReceipt = runtimeBackend.loadReceipt;

let runtimeCamera = createRuntimeCamera();
let enemyPolicyTick = 0;
let menuMode: DemoMenuMode = 'closed';
let lastMenuIntent = null;
let inputSettings = {
  invertY: false,
  lookSensitivityDegreesPerPixel: 0.1,
  moveSpeedUnitsPerSecond: 3,
};
const generatedTunnelReadout = TINY_GENERATED_TUNNEL_READOUT;
const inputSession = runtimeGateway.inputSession();
const pauseContextConsumer = inputSession === null
  ? null
  : new ResolvedPauseContextConsumer(inputSession);
let lastProcessedInputSequence = -1;
let pointerLockWasActive = false;
const levelFrame = createAshaRendererGeneratedTunnelRoomSurfaceFrame({
  tunnel: generatedTunnelReadout,
  enemy: readEnemyRenderFrameTarget(),
});

const surface = await mountAshaRendererAnimatedMeshSurface(canvas, {
  animatedMeshManifest: demoProjectContent.catalogs.animatedMeshManifest,
  autoStart: true,
  clearColor: 0x101820,
  frame: levelFrame,
  controls: {
    initialPosition: demoProjectContent.runtime.initialCameraPose.position,
    mouseSensitivity: (inputSettings.lookSensitivityDegreesPerPixel * Math.PI) / 180,
    moveSpeed: inputSettings.moveSpeedUnitsPerSecond,
    movementAuthority: constrainCameraMovement,
    ...(inputSession === null ? {} : { inputSession }),
  },
});

let audioHost = createDemoAudioHost();
let animationHost = createDemoAnimationHost();
let billboardHost = createDemoBillboardHost();
let particleHost = createDemoParticleHost();
let prefabPlacementProjection = await projectPrefabPlacements();
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
const animationTargetFrame = animationIntent === null
  ? null
  : buildRuntimeSessionAnimationControllerTargetFrame(animationIntent);
const animationFrameReceipt = animationTargetFrame === null ? null : surface.applyFrame(animationTargetFrame);
if (animationIntent !== null && animationFrameReceipt?.applied !== true) {
  throw new Error(
    `ASHA animated mesh frame was rejected: ${animationFrameReceipt?.diagnostics?.map((diagnostic) => diagnostic.message).join('; ') ?? 'unknown renderer-host error'}`,
  );
}

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

  const generatedTunnelOperation = runtimeBackend.generatedTunnelOperation;
  if (generatedTunnelOperation?.status !== 'applied') {
    lastMovementEvent = 'Movement blocked: generated tunnel collision unavailable';
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
    grid: generatedTunnelOperation.grid,
    movementMode: 'grounded',
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
    shape: demoProjectContent.runtime.collisionShape,
    policy: demoProjectContent.runtime.collisionPolicy,
  });
  lastCollisionReceipt = receipt;
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
  resetLoop();
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
    lastRuntimeEvent = lastGameplayTransform === null
      ? 'Fire hit'
      : `Fire hit - ${lastGameplayTransform.moduleRef.moduleId}`;
    lastEventSource = 'runtime';
    pulseReticle('hit');
  } else {
    lastRuntimeEvent = actionReceipt.accepted ? 'Fire missed' : 'Fire rejected';
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
            asset: PRIMARY_FIRE_SPRITE_ASSET,
            contentHash: PRIMARY_FIRE_SPRITE_CONTENT_HASH,
            frameCount: 1,
          },
          ratePerSecond: 0,
          burstCount: 6,
          lifetimeSeconds: [6, 8],
          velocityMin: [-0.7, 0.3, -0.4],
          velocityMax: [0.7, 1.2, 0.4],
          acceleration: [0, -1.5, 0],
          sizeCurve: [
            { age: 0, value: 0.38 },
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
    return new AshaAudioHost({ resolveResource: resolveDemoAudioResource });
  } catch {
    return null;
  }
}

function createDemoAnimationHost() {
  const asset = demoProjectContent.catalogs.animatedMeshManifest.resources[0]?.asset;
  if (asset === undefined) {
    throw new Error('ASHA demo animation cue asset is unavailable');
  }
  return new AshaAnimationHost(surface.animationProjection, {
    cues: [{
      cueId: 'demo.primary-fire.jump-impact',
      asset,
      clip: 'jump',
      atSeconds: 0.05,
      signal: { domain: 'particle', id: 'demo.primary-fire.jump-impact.local-vfx' },
    }],
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
      resolveResource: resolveDemoParticleResource,
      sink: createDemoParticleBillboardSink(billboardLayer, projectBillboardWorldPoint),
    });
  } catch {
    return null;
  }
}

async function projectPrefabPlacements() {
  if (billboardHost === null) {
    return { applied: 0, diagnostics: ['billboard host unavailable'] };
  }
  const instances = demoProjectContent.prefabAuthoring.runtimeBootstrap.placements;
  if (instances.length !== 2) {
    return { applied: 0, diagnostics: ['prefab placement authoring unavailable'] };
  }
  const operations = instances.map((instance, index) => {
    return {
      domain: 'billboard' as const,
      meta: {
        sequence: index,
        origin: {
          kind: 'ownerFact' as const,
          id: `prefab-placement:${instance.instance}`,
          authorityTick: 1,
          causationId: runtimeBackend.prefabInteractionReceipt?.reactionFrameHash ?? null,
          correlationId: runtimeBackend.prefabInteractionReceipt?.eventHash ?? null,
        },
      },
      op: {
        op: 'create' as const,
        handle: billboardHandle(7_000 + index),
        descriptor: {
          anchor: {
            kind: 'world' as const,
            position: [
              instance.transform.translation[0],
              instance.transform.translation[1] + 1.45,
              instance.transform.translation[2],
            ] as const,
          },
          content: {
            kind: 'text' as const,
            localizationKey: `demo.prefab.${instance.origin}`,
            fallbackText: instance.origin === 'player' ? 'Player-placed console' : 'Authored console',
            arguments: [],
          },
          font: { kind: 'system' as const, family: 'sans-serif' },
          heightPixels: 20,
          color: instance.origin === 'player' ? [1, 0.45, 0.35, 1] as const : [0.35, 0.7, 1, 1] as const,
          background: [0.02, 0.04, 0.08, 0.82] as const,
          maxDistance: 30,
          layer: 'depthTested' as const,
          visible: true,
        },
      },
    };
  });
  return billboardHost.applyPresentation({
    replayScope: 'excludedFromReplayTruth',
    ops: operations,
  });
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
  const camera = surface.cameraPose();
  const viewport = readViewport();
  const relative = [
    position[0] - camera.position[0],
    position[1] - camera.position[1],
    position[2] - camera.position[2],
  ];
  const distance = Math.hypot(relative[0], relative[1], relative[2]);
  const horizontalDistance = Math.hypot(relative[0], relative[2]);
  if (horizontalDistance < 0.5 && Math.abs(relative[1]) < 3) {
    return {
      xPixels: viewport.width / 2,
      yPixels: viewport.height - 72,
      depth: 0,
      distance,
      insideViewport: true,
      occluded: false,
    };
  }
  const forward = readAudioForward(camera);
  const right = [forward[2] * -1, 0, forward[0]];
  const rightLength = Math.hypot(right[0], right[2]) || 1;
  right[0] /= rightLength;
  right[2] /= rightLength;
  const up = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ];
  const depth = dot3(relative, forward);
  const halfHeight = Math.max(depth, 0.001) * Math.tan((55 * Math.PI) / 360);
  const halfWidth = halfHeight * (viewport.width / viewport.height);
  const ndcX = dot3(relative, right) / halfWidth;
  const ndcY = dot3(relative, up) / halfHeight;
  return {
    xPixels: ((ndcX + 1) / 2) * viewport.width,
    yPixels: ((1 - ndcY) / 2) * viewport.height,
    depth: Math.max(0, Math.min(1, depth / 100)),
    distance,
    insideViewport: depth > 0 && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1,
    occluded: false,
  };
}

function dot3(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
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
  if (!runtimeGateway.available()) {
    runtimeCamera = createRuntimeCamera();
    enemyPolicyTick = 0;
    lastEnemyPolicyReadout = null;
    restartEnemyLoopCadence();
    lastCollisionReceipt = null;
    menuMode = 'closed';
    lastMovementEvent = 'Reset unavailable: Rust runtime backend missing';
    lastRuntimeEvent = lastMovementEvent;
    lastEventSource = 'runtime';
    resetPresentationHostsForRuntimeRestart();
    surface.resetCamera();
    void applyLatestRuntimeProjection();
    void projectPrefabPlacements();
    pulseReticle('miss');
    renderHud();
    return;
  }

  const statusBefore = readLifecycleStatus();
  if (readAuthorityPaused()) {
    consumePauseAction('runtime.time.resume', 'shellControl', false);
  }
  const restartReceipt = runtimeGateway.requestSessionRestart({
    kind: 'runtime.restart_session_intent',
    source: 'hud_menu',
    requireTerminal: false,
    expectedSessionHash: statusBefore.sessionHash,
  });
  runtimeCamera = createRuntimeCamera();
  enemyPolicyTick = 0;
  lastEnemyPolicyReadout = null;
  restartEnemyLoopCadence();
  lastCollisionReceipt = null;
  menuMode = 'closed';
  lastMovementEvent = 'Reset';
  lastRuntimeEvent = restartReceipt.accepted ? 'Runtime reset' : 'Reset rejected';
  lastEventSource = 'runtime';
  resetPresentationHostsForRuntimeRestart();
  surface.resetCamera();
  void applyLatestRuntimeProjection();
  void projectPrefabPlacements();
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

  const paused = readAuthorityPaused();
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
  void applyLatestRuntimeProjection();
  renderHud();
  return readout;
}

function restartEnemyLoopCadence() {
  if (enemyLoopTimer !== null) {
    window.clearInterval(enemyLoopTimer);
  }
  enemyLoopTimer = window.setInterval(() => {
    tickEnemyPolicy();
  }, 750);
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
  const bytes = demoProjectContent.projectBundle.gameplayModuleBindings
    ?.configurations?.find((configuration) => configuration.configurationId === 'demo.primary-fire-effect.default')
    ?.canonicalConfig;
  if (!Array.isArray(bytes)) {
    return 0;
  }
  try {
    return Number(JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes))).objectivePoints ?? 0);
  } catch {
    return 0;
  }
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
  drainResolvedInputDeliveries();
  billboardHost?.refreshLayout();
  particleHost?.advance(1 / 60);
  const animationReceipt = animationHost.advance(1 / 60);
  for (const cue of animationReceipt.cues) {
    void realizeAnimationSampledCue(cue);
  }
  renderHud();
  animationFrame = window.requestAnimationFrame(tickHud);
}

renderHud();
restartEnemyLoopCadence();
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
  return null;
}
}
