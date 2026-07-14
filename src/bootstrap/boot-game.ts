import {
  AshaAudioHost,
  AshaAnimationHost,
  AshaBillboardHost,
  AshaLiveTelemetryCollector,
  AshaParticleHost,
  AshaTelemetryOverlayHost,
  type AshaAnimationSampledCue,
  applyAshaRuntimeProjectionFrame,
  createAshaRendererGeneratedTunnelRoomSurfaceFrame,
  mountAshaRendererAnimatedMeshSurface,
} from '@asha/renderer-host';
import {
  billboardHandle,
  cameraHandle,
  telemetryOverlayHandle,
  type PresentationOp,
  type RuntimeProjectionFrame,
} from '@asha/contracts';
import {
  ResolvedPauseContextConsumer,
  buildRuntimeSessionAnimationControllerTargetFrame,
} from '@asha/runtime-bridge';
import { TINY_GENERATED_TUNNEL_READOUT } from '@asha/runtime-session';
import { hudControlToIntent } from '../input/hud-controls.js';
import { type DemoHudEventSource, type DemoMenuMode, projectHudView } from '../projection/hud-view.js';
import {
  createDemoInputReplaySession,
  createDemoRuntimeBackend,
  createDemoRuntimeGateway,
} from '../runtime/demo-runtime-gateway.js';
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
import { createDemoTelemetryOverlaySink } from '../projection/telemetry-overlay-sink.js';

export async function bootGame() {
const elements = readDemoHudElements();
const canvas = elements.canvas;
const billboardLayer = elements.billboardLayer;
const telemetryOverlayLayer = elements.telemetryOverlayLayer;
const reticle = elements.reticle;

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('ASHA renderer surface canvas is missing.');
}
if (!(billboardLayer instanceof HTMLElement)) {
  throw new Error('ASHA billboard projection layer is missing.');
}
if (!(telemetryOverlayLayer instanceof HTMLElement)) {
  throw new Error('ASHA telemetry overlay projection layer is missing.');
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
let hudFrameCount = 0;
let lastPauseContextReceipt = null;
const recordedPauseActions = [];
const recordedPauseOutcomes = [];
const recordedGameplayActions = [];
const recordedGameplayOutcomes = [];
let lastInputReplayEvidence = null;
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
let liveTelemetryCollector = createDemoLiveTelemetryCollector();
let telemetryOverlayHost = createDemoTelemetryOverlayHost();
const telemetryOverlay = telemetryOverlayHandle(1);
let prefabPlacementProjection = await projectPrefabPlacements();
let presentationHostGeneration = 1;
let lastAudioProjectionEvidence = {
  status: audioHost === null ? 'unavailable' : 'ready',
  authorityTick: null,
  applied: 0,
  diagnostics: [],
  origin: null,
};
let lastBillboardProjectionEvidence = {
  status: billboardHost === null ? 'unavailable' : 'ready',
  authorityTick: null,
  applied: 0,
  diagnostics: [],
  origins: [],
};
let lastParticleProjectionEvidence = {
  status: particleHost === null ? 'unavailable' : 'ready',
  authorityTick: null,
  applied: 0,
  diagnostics: [],
  origins: [],
  activeParticles: 0,
  emittedBursts: 0,
  droppedParticles: 0,
};
let lastTelemetryOverlayEvidence = {
  status: telemetryOverlayHost === null ? 'unavailable' : 'ready',
  authorityTick: null,
  applied: 0,
  diagnostics: [],
  activeOverlays: 0,
  renderedSnapshots: 0,
};
let lastAnimationProjectionEvidence = {
  status: 'ready',
  authorityTick: null,
  applied: 0,
  diagnostics: [],
  origin: null,
  controller: null,
};
let lastIntegratedFeedbackEvidence = {
  status: 'ready',
  authorityTick: null,
  replayScope: null,
  hostGeneration: presentationHostGeneration,
  operationDomains: [],
  origin: null,
  originConsistent: false,
  domains: {},
  diagnostics: [],
};
let lastAnimationSampledCueEvidence = {
  status: 'waiting',
  cue: null,
  realization: null,
};
let lastRuntimeProjectionFrame = null;
let lastAppliedRuntimeProjectionFingerprint: string | null = null;
let retainedPresentationState = new Map<string, PresentationOp>();
let retainedPresentationStateBeforeLatest = new Map<string, PresentationOp>();
let lastPresentationDegradationEvidence = {
  status: 'healthy',
  cases: [],
  authorityUnchanged: true,
};
let lastTelemetryFrameMs = performance.now();
let lastTelemetrySampleMs = 0;

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
  telemetryOverlayHost?.cleanup();
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
  const presentationStateBeforeFrame = new Map(retainedPresentationState);
  lastRuntimeProjectionFrame = projection.runtimeFrame;
  const origin = projection.runtimeFrame.presentation.ops[0]?.meta.origin ?? null;
  const billboardOrigins = projection.runtimeFrame.presentation.ops
    .filter((operation) => operation.domain === 'billboard')
    .map((operation) => operation.meta.origin)
    .filter((value) => value !== null);
  const particleOrigins = projection.runtimeFrame.presentation.ops
    .filter((operation) => operation.domain === 'particle')
    .map((operation) => operation.meta.origin)
    .filter((value) => value !== null);
  const animationOperation = projection.runtimeFrame.presentation.ops
    .filter((operation) => operation.domain === 'animation' && operation.op.op === 'update')
    .at(-1) ?? null;
  const operationDomains = projection.runtimeFrame.presentation.ops.map((operation) => operation.domain);
  const feedbackOrigins = projection.runtimeFrame.presentation.ops
    .map((operation) => operation.meta.origin)
    .filter((value) => value !== null);
  const integratedOrigin = feedbackOrigins[0] ?? null;
  const originConsistent = integratedOrigin !== null
    && feedbackOrigins.length === projection.runtimeFrame.presentation.ops.length
    && feedbackOrigins.every((value) => presentationOriginsEqual(value, integratedOrigin));
  lastAudioProjectionEvidence = {
    status: 'pending',
    authorityTick: projection.runtimeFrame.authorityTick,
    applied: 0,
    diagnostics: [],
    origin,
  };
  lastBillboardProjectionEvidence = {
    status: 'pending',
    authorityTick: projection.runtimeFrame.authorityTick,
    applied: 0,
    diagnostics: [],
    origins: billboardOrigins,
  };
  lastParticleProjectionEvidence = {
    status: 'pending',
    authorityTick: projection.runtimeFrame.authorityTick,
    applied: 0,
    diagnostics: [],
    origins: particleOrigins,
    activeParticles: 0,
    emittedBursts: 0,
    droppedParticles: 0,
  };
  lastIntegratedFeedbackEvidence = {
    status: 'pending',
    authorityTick: projection.runtimeFrame.authorityTick,
    replayScope: projection.runtimeFrame.presentation.replayScope,
    hostGeneration: presentationHostGeneration,
    operationDomains,
    origin: integratedOrigin,
    originConsistent,
    domains: {},
    diagnostics: [],
  };
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
      ...(telemetryOverlayHost === null ? {} : { telemetryOverlayHost }),
    });
    retainedPresentationStateBeforeLatest = presentationStateBeforeFrame;
    applyRetainedPresentationOperations(retainedPresentationState, projection.runtimeFrame.presentation.ops);
    const diagnostics = [
      ...listenerDiagnostics,
      ...resumeDiagnostics,
      ...receipt.audio.diagnostics,
    ];
    lastAudioProjectionEvidence = {
      status: diagnostics.length === 0 ? 'applied' : 'degraded',
      authorityTick: receipt.authorityTick,
      applied: receipt.audio.applied,
      diagnostics,
      origin,
    };
    lastBillboardProjectionEvidence = {
      status: receipt.billboard.diagnostics.length === 0 ? 'applied' : 'degraded',
      authorityTick: receipt.authorityTick,
      applied: receipt.billboard.applied,
      diagnostics: [...receipt.billboard.diagnostics],
      origins: billboardOrigins,
    };
    lastParticleProjectionEvidence = {
      status: receipt.particle.diagnostics.length === 0 ? 'applied' : 'degraded',
      authorityTick: receipt.authorityTick,
      applied: receipt.particle.applied,
      diagnostics: [...receipt.particle.diagnostics],
      origins: particleOrigins,
      activeParticles: receipt.particle.readout.activeParticles,
      emittedBursts: receipt.particle.readout.emittedBursts,
      droppedParticles: receipt.particle.readout.droppedParticles,
    };
    lastTelemetryOverlayEvidence = {
      status: receipt.telemetryOverlay.diagnostics.length === 0 ? 'applied' : 'degraded',
      authorityTick: receipt.authorityTick,
      applied: receipt.telemetryOverlay.applied,
      diagnostics: [...receipt.telemetryOverlay.diagnostics],
      activeOverlays: receipt.telemetryOverlay.readout.activeOverlays,
      renderedSnapshots: receipt.telemetryOverlay.readout.renderedSnapshots,
    };
    lastAnimationProjectionEvidence = {
      status: receipt.animation.diagnostics.length === 0 ? 'applied' : 'degraded',
      authorityTick: receipt.authorityTick,
      applied: receipt.animation.applied,
      diagnostics: [...receipt.animation.diagnostics],
      origin: animationOperation?.meta.origin ?? null,
      controller: animationOperation?.domain === 'animation' && animationOperation.op.op === 'update'
        ? animationOperation.op.controller
        : null,
    };
    const integratedDiagnostics = [
      ...diagnostics.map((diagnostic) => ({ domain: 'audio', ...diagnostic })),
      ...receipt.billboard.diagnostics.map((diagnostic) => ({ domain: 'billboard', ...diagnostic })),
      ...receipt.particle.diagnostics.map((diagnostic) => ({ domain: 'particle', ...diagnostic })),
      ...receipt.animation.diagnostics.map((diagnostic) => ({ domain: 'animation', ...diagnostic })),
      ...receipt.telemetryOverlay.diagnostics.map((diagnostic) => ({ domain: 'telemetryOverlay', ...diagnostic })),
    ];
    lastIntegratedFeedbackEvidence = {
      status: integratedDiagnostics.length === 0 && originConsistent ? 'applied' : 'degraded',
      authorityTick: receipt.authorityTick,
      replayScope: projection.runtimeFrame.presentation.replayScope,
      hostGeneration: presentationHostGeneration,
      operationDomains,
      origin: integratedOrigin,
      originConsistent,
      domains: {
        audio: { applied: receipt.audio.applied, diagnostics: receipt.audio.diagnostics.length },
        billboard: { applied: receipt.billboard.applied, diagnostics: receipt.billboard.diagnostics.length },
        particle: { applied: receipt.particle.applied, diagnostics: receipt.particle.diagnostics.length },
        animation: { applied: receipt.animation.applied, diagnostics: receipt.animation.diagnostics.length },
        telemetryOverlay: {
          applied: receipt.telemetryOverlay.applied,
          diagnostics: receipt.telemetryOverlay.diagnostics.length,
        },
      },
      diagnostics: integratedDiagnostics,
    };
    lastAppliedRuntimeProjectionFingerprint = projectionFingerprint;
  } catch (error) {
    lastAudioProjectionEvidence = {
      status: 'failed',
      authorityTick: projection.runtimeFrame.authorityTick,
      applied: 0,
      diagnostics: [{
        code: 'hostFailure',
        handle: null,
        message: error instanceof Error ? error.message : String(error),
        origin,
        sequence: 0,
      }],
      origin,
    };
    lastBillboardProjectionEvidence = {
      status: 'failed',
      authorityTick: projection.runtimeFrame.authorityTick,
      applied: 0,
      diagnostics: [{
        code: 'hostFailure',
        handle: null,
        message: error instanceof Error ? error.message : String(error),
        origin: billboardOrigins[0] ?? null,
        sequence: 0,
      }],
      origins: billboardOrigins,
    };
    lastParticleProjectionEvidence = {
      status: 'failed',
      authorityTick: projection.runtimeFrame.authorityTick,
      applied: 0,
      diagnostics: [{
        code: 'hostFailure',
        handle: null,
        message: error instanceof Error ? error.message : String(error),
        origin: particleOrigins[0] ?? null,
        sequence: 0,
      }],
      origins: particleOrigins,
      activeParticles: 0,
      emittedBursts: 0,
      droppedParticles: 0,
    };
    lastTelemetryOverlayEvidence = {
      status: 'failed',
      authorityTick: projection.runtimeFrame.authorityTick,
      applied: 0,
      diagnostics: [{
        code: 'hostFailure',
        handle: telemetryOverlay,
        message: error instanceof Error ? error.message : String(error),
        origin: null,
        sequence: 0,
      }],
      activeOverlays: 0,
      renderedSnapshots: 0,
    };
    lastAnimationProjectionEvidence = {
      status: 'failed',
      authorityTick: projection.runtimeFrame.authorityTick,
      applied: 0,
      diagnostics: [{
        code: 'hostFailure',
        handle: null,
        message: error instanceof Error ? error.message : String(error),
        origin: animationOperation?.meta.origin ?? null,
        sequence: 0,
        target: null,
      }],
      origin: animationOperation?.meta.origin ?? null,
      controller: null,
    };
    lastIntegratedFeedbackEvidence = {
      status: 'failed',
      authorityTick: projection.runtimeFrame.authorityTick,
      replayScope: projection.runtimeFrame.presentation.replayScope,
      hostGeneration: presentationHostGeneration,
      operationDomains,
      origin: integratedOrigin,
      originConsistent,
      domains: {},
      diagnostics: [{
        domain: 'frame',
        code: 'hostFailure',
        handle: null,
        message: error instanceof Error ? error.message : String(error),
        origin: integratedOrigin,
        sequence: 0,
      }],
    };
  }
}

function presentationOriginsEqual(left, right) {
  return left.kind === right.kind
    && left.id === right.id
    && left.authorityTick === right.authorityTick
    && left.causationId === right.causationId
    && left.correlationId === right.correlationId;
}

function applyRetainedPresentationOperations(
  state: Map<string, PresentationOp>,
  operations: readonly PresentationOp[],
) {
  for (const operation of operations) {
    if (operation.domain === 'audio') {
      if (operation.op.op === 'emit') {
        continue;
      }
      const key = `audio:${operation.op.handle}`;
      if (operation.op.op === 'destroy') {
        state.delete(key);
        continue;
      }
      if (operation.op.op === 'create') {
        state.set(key, operation);
        continue;
      }
      const retained = state.get(key);
      if (retained?.domain !== 'audio' || retained.op.op !== 'create') {
        continue;
      }
      state.set(key, {
        ...retained,
        meta: operation.meta,
        op: {
          ...retained.op,
          descriptor: mergeRetainedDescriptorPatch(retained.op.descriptor, operation.op.patch),
        },
      });
      continue;
    }
    if (operation.domain === 'particle') {
      if (operation.op.op === 'emit') {
        continue;
      }
      const key = `particle:${operation.op.handle}`;
      if (operation.op.op === 'destroy') {
        state.delete(key);
        continue;
      }
      if (operation.op.op === 'create') {
        state.set(key, operation);
        continue;
      }
      const retained = state.get(key);
      if (retained?.domain !== 'particle' || retained.op.op !== 'create') {
        continue;
      }
      state.set(key, {
        ...retained,
        meta: operation.meta,
        op: {
          ...retained.op,
          descriptor: mergeRetainedDescriptorPatch(retained.op.descriptor, operation.op.patch),
        },
      });
      continue;
    }
    if (operation.domain === 'billboard') {
      const key = `billboard:${operation.op.handle}`;
      if (operation.op.op === 'destroy') {
        state.delete(key);
        continue;
      }
      if (operation.op.op === 'create') {
        state.set(key, operation);
        continue;
      }
      const retained = state.get(key);
      if (retained?.domain !== 'billboard' || retained.op.op !== 'create') {
        continue;
      }
      state.set(key, {
        ...retained,
        meta: operation.meta,
        op: {
          ...retained.op,
          descriptor: mergeRetainedDescriptorPatch(retained.op.descriptor, operation.op.patch),
        },
      });
      continue;
    }
    if (operation.domain === 'telemetryOverlay') {
      const key = `telemetryOverlay:${operation.op.handle}`;
      if (operation.op.op === 'destroy') {
        state.delete(key);
        continue;
      }
      if (operation.op.op === 'create') {
        state.set(key, operation);
        continue;
      }
      const retained = state.get(key);
      if (retained?.domain !== 'telemetryOverlay' || retained.op.op !== 'create') {
        continue;
      }
      state.set(key, {
        ...retained,
        meta: operation.meta,
        op: {
          ...retained.op,
          descriptor: mergeRetainedDescriptorPatch(retained.op.descriptor, operation.op.patch),
        },
      });
      continue;
    }
    const key = `animation:${operation.op.handle}`;
    if (operation.op.op === 'destroy') {
      state.delete(key);
      continue;
    }
    if (operation.op.op === 'create') {
      state.set(key, operation);
      continue;
    }
    const retained = state.get(key);
    if (retained?.domain !== 'animation' || retained.op.op !== 'create') {
      continue;
    }
    state.set(key, {
      ...retained,
      meta: operation.meta,
      op: {
        ...retained.op,
        descriptor: {
          ...retained.op.descriptor,
          controller: operation.op.controller,
        },
      },
    });
  }
}

function mergeRetainedDescriptorPatch<Descriptor extends object>(
  descriptor: Descriptor,
  patch: object,
): Descriptor {
  const merged = { ...descriptor };
  for (const [field, value] of Object.entries(patch)) {
    if (value !== null && value !== undefined) {
      Object.assign(merged, { [field]: value });
    }
  }
  return merged;
}

function buildRetainedPresentationRestoreFrame(
  currentFrame: RuntimeProjectionFrame,
  state: ReadonlyMap<string, PresentationOp>,
): RuntimeProjectionFrame {
  const operations = [...state.values()].map((operation, sequence) => ({
    ...operation,
    meta: { ...operation.meta, sequence },
  })) as PresentationOp[];
  return {
    ...currentFrame,
    presentation: {
      replayScope: currentFrame.presentation.replayScope,
      ops: operations,
    },
  };
}

async function exercisePresentationDegradation(domain) {
  if (!['audio', 'particle', 'font', 'overlay'].includes(domain)) {
    throw new Error(`unsupported presentation degradation domain ${String(domain)}`);
  }
  if (lastRuntimeProjectionFrame === null) {
    throw new Error('runtime projection frame is unavailable');
  }
  const sessionHashBefore = readLifecycleStatus().sessionHash;
  const interactionBefore = JSON.stringify(readRuntimeInteractionState());
  const result = await runPresentationDegradationCase(domain, lastRuntimeProjectionFrame);
  const sessionHashAfter = readLifecycleStatus().sessionHash;
  const interactionAfter = JSON.stringify(readRuntimeInteractionState());
  const authorityUnchanged = sessionHashAfter === sessionHashBefore
    && interactionAfter === interactionBefore;
  const retainedCases = lastPresentationDegradationEvidence.cases.filter(
    (value) => value.domain !== domain,
  );
  lastPresentationDegradationEvidence = {
    status: 'degraded',
    cases: [...retainedCases, result],
    authorityUnchanged: lastPresentationDegradationEvidence.authorityUnchanged
      && authorityUnchanged,
  };
  renderHud();
  return lastPresentationDegradationEvidence;
}

async function runPresentationDegradationCase(domain, runtimeFrame) {
  const sourceOperation = runtimeFrame.presentation.ops.find((operation) =>
    operation.domain === (domain === 'overlay' ? 'telemetryOverlay' : domain)
  ) ?? null;
  const origin = sourceOperation?.meta.origin ?? lastIntegratedFeedbackEvidence.origin;
  if (domain === 'audio') {
    if (sourceOperation?.domain !== 'audio') {
      throw new Error('audio projection operation is unavailable');
    }
    const host = new AshaAudioHost({
      resolveResource: async () => {
        throw new Error('demo missing audio resource');
      },
    });
    const receipt = await host.applyPresentation({
      replayScope: runtimeFrame.presentation.replayScope,
      ops: [sourceOperation],
    });
    await host.dispose();
    return degradationResult(domain, receipt, origin);
  }
  if (domain === 'particle') {
    if (sourceOperation?.domain !== 'particle') {
      throw new Error('particle projection operation is unavailable');
    }
    const host = new AshaParticleHost({
      maxParticles: 16,
      resolveEntityPosition: resolveBillboardEntityPosition,
      resolveResource: async () => null,
      sink: createDemoParticleBillboardSink(billboardLayer, projectBillboardWorldPoint),
    });
    const receipt = await host.applyPresentation({
      replayScope: runtimeFrame.presentation.replayScope,
      ops: [sourceOperation],
    });
    host.dispose();
    return degradationResult(domain, receipt, origin);
  }
  if (domain === 'font') {
    const host = new AshaBillboardHost({
      container: billboardLayer,
      resolveEntityPosition: resolveBillboardEntityPosition,
      projectWorld: projectBillboardWorldPoint,
      resolveResource: async () => null,
    });
    const receipt = await host.applyPresentation({
      replayScope: runtimeFrame.presentation.replayScope,
      ops: [{
        domain: 'billboard',
        meta: { sequence: 0, origin },
        op: {
          op: 'create',
          handle: billboardHandle(9_654),
          descriptor: {
            anchor: { kind: 'world', position: [0, 1.5, -2] },
            content: {
              kind: 'text',
              localizationKey: 'demo.missing-font',
              fallbackText: 'Missing font fixture',
              arguments: [],
            },
            font: {
              kind: 'asset',
              asset: 'font/demo-missing',
              contentHash: '0'.repeat(64),
              family: 'Demo Missing',
            },
            heightPixels: 24,
            color: [1, 1, 1, 1],
            background: [0, 0, 0, 0.8],
            maxDistance: 50,
            layer: 'alwaysOnTop',
            visible: true,
          },
        },
      }],
    });
    host.dispose();
    return degradationResult(domain, receipt, origin);
  }
  const retainedOverlayOperation = [...retainedPresentationState.values()].find(
    (operation) => operation.domain === 'telemetryOverlay',
  ) ?? null;
  if (retainedOverlayOperation?.domain !== 'telemetryOverlay') {
    throw new Error('telemetry overlay projection operation is unavailable');
  }
  const host = new AshaTelemetryOverlayHost({
    collector: createDemoLiveTelemetryCollector(),
    sink: {
      render() {
        throw new Error('demo missing overlay realization resource');
      },
      destroy() {},
    },
  });
  const receipt = host.applyPresentation({
    replayScope: runtimeFrame.presentation.replayScope,
    ops: [retainedOverlayOperation],
  });
  host.cleanup();
  return degradationResult(domain, receipt, origin);
}

function degradationResult(domain, receipt, origin) {
  const diagnostic = receipt.diagnostics[0] ?? null;
  if (diagnostic === null) {
    throw new Error(`${domain} degradation probe unexpectedly succeeded`);
  }
  return {
    domain,
    status: 'visibleFailure',
    code: diagnostic.code,
    message: diagnostic.message,
    origin: diagnostic.origin ?? origin,
    applied: receipt.applied,
  };
}

async function realizeAnimationSampledCue(cue: AshaAnimationSampledCue) {
  lastAnimationSampledCueEvidence = {
    status: 'pending',
    cue,
    realization: null,
  };
  renderHud();
  if (cue.signal.domain !== 'particle' || particleHost === null) {
    lastAnimationSampledCueEvidence = {
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
  lastAnimationSampledCueEvidence = {
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

async function rebuildPresentationHosts() {
  const sessionHashBefore = readLifecycleStatus().sessionHash;
  const interactionBefore = JSON.stringify(readRuntimeInteractionState());
  const controllerBefore = JSON.stringify(lastAnimationProjectionEvidence.controller);

  await audioHost?.dispose();
  animationHost.cleanup();
  billboardHost?.dispose();
  particleHost?.dispose();
  telemetryOverlayHost?.cleanup();

  audioHost = createDemoAudioHost();
  animationHost = createDemoAnimationHost();
  billboardHost = createDemoBillboardHost();
  particleHost = createDemoParticleHost();
  liveTelemetryCollector = createDemoLiveTelemetryCollector();
  telemetryOverlayHost = createDemoTelemetryOverlayHost();
  presentationHostGeneration += 1;
  lastAppliedRuntimeProjectionFingerprint = null;

  if (lastRuntimeProjectionFrame !== null) {
    const restoreFrame = buildRetainedPresentationRestoreFrame(
      lastRuntimeProjectionFrame,
      retainedPresentationStateBeforeLatest,
    );
    const restoreReceipt = await applyAshaRuntimeProjectionFrame(restoreFrame, {
      applyScene: () => {},
      ...(audioHost === null ? {} : { audioHost }),
      ...(billboardHost === null ? {} : { billboardHost }),
      ...(particleHost === null ? {} : { particleHost }),
      animationHost,
      ...(telemetryOverlayHost === null ? {} : { telemetryOverlayHost }),
    });
    const restoreDiagnostics = [
      ...restoreReceipt.audio.diagnostics,
      ...restoreReceipt.billboard.diagnostics,
      ...restoreReceipt.particle.diagnostics,
      ...restoreReceipt.animation.diagnostics,
      ...restoreReceipt.telemetryOverlay.diagnostics,
    ];
    if (restoreDiagnostics.length > 0) {
      throw new Error(
        `presentation host restore failed: ${restoreDiagnostics.map((value) => value.message).join('; ')}`,
      );
    }
  }
  retainedPresentationState = new Map(retainedPresentationStateBeforeLatest);
  await applyLatestRuntimeProjection();
  prefabPlacementProjection = await projectPrefabPlacements();

  const sessionHashAfter = readLifecycleStatus().sessionHash;
  const interactionAfter = JSON.stringify(readRuntimeInteractionState());
  const controllerAfter = JSON.stringify(lastAnimationProjectionEvidence.controller);
  return {
    status: lastIntegratedFeedbackEvidence.status,
    hostGeneration: presentationHostGeneration,
    authorityUnchanged: sessionHashAfter === sessionHashBefore
      && interactionAfter === interactionBefore,
    controllerUnchanged: controllerAfter === controllerBefore,
    sessionHashBefore,
    sessionHashAfter,
    integratedFeedback: lastIntegratedFeedbackEvidence,
  };
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

function createDemoLiveTelemetryCollector() {
  return new AshaLiveTelemetryCollector({
    expectedCounters: [
      'entityCount',
      'activeCapabilityCount',
      'residentChunkCount',
      'dirtyChunkCount',
      'renderDiffCount',
      'renderHandleCount',
      'drawCallCount',
      'activeAudioSourceCount',
      'activeBillboardCount',
      'activeParticleCount',
      'droppedFeedbackCount',
    ],
    maxFrameTimeSamples: 60,
  });
}

function createDemoTelemetryOverlayHost() {
  if (!runtimeGateway.available()) {
    return null;
  }
  return new AshaTelemetryOverlayHost({
    collector: liveTelemetryCollector,
    sink: createDemoTelemetryOverlaySink(telemetryOverlayLayer),
  });
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
  telemetryOverlayHost?.cleanup();

  audioHost = createDemoAudioHost();
  animationHost = createDemoAnimationHost();
  billboardHost = createDemoBillboardHost();
  particleHost = createDemoParticleHost();
  liveTelemetryCollector = createDemoLiveTelemetryCollector();
  telemetryOverlayHost = createDemoTelemetryOverlayHost();
  presentationHostGeneration += 1;
  lastRuntimeProjectionFrame = null;
  lastAppliedRuntimeProjectionFingerprint = null;
  retainedPresentationState = new Map();
  retainedPresentationStateBeforeLatest = new Map();
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

function consumePauseAction(actionOrId, source, projectMenu = true, record = null) {
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
  lastPauseContextReceipt = { source, ...receipt };
  if (record !== null) {
    recordedPauseActions.push(record);
    recordedPauseOutcomes.push(readPauseOutcome(record.recordHash, action.actionId, receipt.accepted));
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
      consumePauseAction(action, 'browserResolvedAction', true, delivery.receipt.record);
      continue;
    }
    if (
      action.actionId === 'gameplay.primaryFire'
      && action.phase === 'pressed'
      && action.value.kind === 'button'
      && action.value.pressed
      && pointerLockWasActive
    ) {
      const result = firePrimary();
      if (delivery.receipt.record !== null && result.runtime !== null) {
        recordedGameplayActions.push(delivery.receipt.record);
        recordedGameplayOutcomes.push(readGameplayOutcome(
          delivery.receipt.record.recordHash,
          action.actionId,
          result.runtime,
          runtimeCamera.pose,
        ));
      }
    }
  }
  pointerLockWasActive = readout.pointerLocked;
}

function readPauseOutcome(recordHash, actionId, accepted) {
  const context = runtimeGateway.readInputContextState();
  const time = runtimeGateway.readTimeControlState();
  return {
    recordHash,
    actionId,
    accepted,
    contextIds: context?.activeContexts.map((entry) => entry.contextId) ?? [],
    contextRevision: context?.revision ?? null,
    contextHash: context?.stateHash ?? null,
    timeMode: time?.mode ?? null,
    timeRevision: time?.revision ?? null,
    timeStateHash: time?.stateHash ?? null,
  };
}

function readGameplayOutcome(recordHash, actionId, receipt, cameraPose) {
  const outcome = receipt?.combatReadout?.outcome ?? { kind: 'rejected' };
  const gameplayTransform = receipt?.gameplayTransform ?? null;
  const target = outcome.kind === 'hit' ? outcome.target : null;
  const damageEvent = receipt?.combatReadout?.events.find(
    (event) => event.kind === 'damage_applied' && event.target === target,
  ) ?? null;
  const targetHealth = receipt?.combatReadout?.health.find(
    (health) => health.entity === target,
  ) ?? null;
  const targetHealthBefore = damageEvent?.kind === 'damage_applied' && targetHealth !== null
    ? { current: damageEvent.before, max: targetHealth.max }
    : null;
  const targetHealthAfter = damageEvent?.kind === 'damage_applied' && targetHealth !== null
    ? { current: damageEvent.after, max: targetHealth.max }
    : null;
  return {
    recordHash,
    actionId,
    accepted: receipt?.accepted === true,
    cameraPose,
    outcome: {
      kind: outcome.kind,
      target,
      targetHealthBefore,
      targetHealthAfter,
    },
    gameplayTransform: gameplayTransform === null ? null : {
      status: gameplayTransform.status,
      damageApplied: gameplayTransform.damageApplied,
      decisionReceiptHash: gameplayTransform.decisionReceiptHash,
      reactionFrameHash: gameplayTransform.reactionFrameHash,
      replayHash: gameplayTransform.replayHash,
    },
    replayHash: receipt?.replayEvidence?.replayHash ?? receipt?.combatReadout?.replayHash ?? null,
  };
}

function comparableGameplayOutcomes(outcomes) {
  return outcomes.map((outcome) => ({
    recordHash: outcome.recordHash,
    actionId: outcome.actionId,
    accepted: outcome.accepted,
    cameraPose: outcome.cameraPose,
    outcome: outcome.outcome,
    gameplayTransform: outcome.gameplayTransform === null ? null : {
      status: outcome.gameplayTransform.status,
      damageApplied: outcome.gameplayTransform.damageApplied,
    },
  }));
}

function comparablePauseOutcomes(outcomes) {
  return outcomes.map((outcome) => ({
    recordHash: outcome.recordHash,
    actionId: outcome.actionId,
    accepted: outcome.accepted,
    contextIds: outcome.contextIds,
    timeMode: outcome.timeMode,
  }));
}

function readInputAuthorityState() {
  return {
    available: inputSession !== null,
    host: surface.inputReadout(),
    context: runtimeGateway.readInputContextState(),
    time: runtimeGateway.readTimeControlState(),
    lastPauseContextReceipt,
    recordedPauseActions: recordedPauseActions.map((record) => ({
      actionId: record.action.actionId,
      contextId: record.action.contextId,
      recordHash: record.recordHash,
    })),
    recordedPauseOutcomes: [...recordedPauseOutcomes],
    recordedGameplayActions: recordedGameplayActions.map((record) => ({
      actionId: record.action.actionId,
      contextId: record.action.contextId,
      recordHash: record.recordHash,
    })),
    recordedGameplayOutcomes: [...recordedGameplayOutcomes],
    replay: lastInputReplayEvidence,
    hudFrameCount,
  };
}

async function replayRecordedInput() {
  const records = [...recordedPauseActions, ...recordedGameplayActions]
    .sort((left, right) => left.action.sequence - right.action.sequence);
  if (records.length === 0) {
    throw new Error('No authority-issued semantic input records are available for replay.');
  }
  const replayRuntime = await createDemoInputReplaySession(demoProjectContent);
  const replaySession = replayRuntime.session;
  const replayGateway = replayRuntime.gateway;
  const replayCameraPose = recordedGameplayOutcomes[0]?.cameraPose
    ?? demoProjectContent.runtime.initialCameraPose;
  const replayCamera = replayGateway.createCamera({
    initialPose: replayCameraPose,
    projection: demoProjectContent.runtime.cameraProjection,
    viewport: { width: 1280, height: 720 },
  })?.snapshot;
  if (replayCamera === undefined) {
    throw new Error('Fresh input replay RuntimeSession could not create an authoritative camera.');
  }
  const replayConsumer = new ResolvedPauseContextConsumer(replaySession);
  const replayOutcomes = [];
  const replayGameplayOutcomes = [];
  const replayReceipts = [];
  let duplicateReceipt = null;
  for (const record of records) {
    const replayReceipt = replaySession.replayResolvedInputAction(record);
    replayReceipts.push(replayReceipt);
    if (!replayReceipt.accepted || replayReceipt.action === null) {
      throw new Error(
        `Recorded action ${record.recordHash} was rejected by the fresh RuntimeSession: ${replayReceipt.diagnostics[0]?.message ?? 'unknown replay rejection'}`,
      );
    }
    if (duplicateReceipt === null) {
      duplicateReceipt = replaySession.replayResolvedInputAction(record);
    }
    if (
      replayReceipt.action.actionId === 'runtime.time.pause'
      || replayReceipt.action.actionId === 'runtime.time.resume'
    ) {
      const pauseReceipt = replayConsumer.consume(replayReceipt.action);
      if (pauseReceipt === null || !pauseReceipt.accepted) {
        throw new Error(`Replayed action ${record.recordHash} did not reproduce its accepted pause-context outcome.`);
      }
      const context = replaySession.readInputContextState();
      const time = replaySession.readTimeControlState();
      replayOutcomes.push({
        recordHash: record.recordHash,
        actionId: replayReceipt.action.actionId,
        accepted: pauseReceipt.accepted,
        contextIds: context.activeContexts.map((entry) => entry.contextId),
        contextRevision: context.revision,
        contextHash: context.stateHash,
        timeMode: time.mode,
        timeRevision: time.revision,
        timeStateHash: time.stateHash,
      });
      continue;
    }
    if (replayReceipt.action.actionId !== 'gameplay.primaryFire') {
      throw new Error(`Recorded action ${record.recordHash} has no downstream semantic replay handler.`);
    }
    const playable = replayGateway.readPlayableLoopState({ paused: false, menuMode: 'closed' });
    const gameplayReceipt = replayGateway.submitPrimaryFire({
      phase: replayReceipt.action.phase,
      camera: replayCamera,
      tick: playable.counters.actionTick,
      source: 'programmatic',
      pressed: replayReceipt.action.value.kind === 'button' && replayReceipt.action.value.pressed,
    });
    if (!gameplayReceipt.accepted) {
      throw new Error(`Replayed action ${record.recordHash} did not reproduce an accepted gameplay outcome.`);
    }
    replayGameplayOutcomes.push(readGameplayOutcome(
      record.recordHash,
      replayReceipt.action.actionId,
      gameplayReceipt,
      replayCameraPose,
    ));
  }
  const samePauseOutcomes = JSON.stringify(comparablePauseOutcomes(replayOutcomes))
    === JSON.stringify(comparablePauseOutcomes(recordedPauseOutcomes));
  const sameGameplayOutcomes = JSON.stringify(comparableGameplayOutcomes(replayGameplayOutcomes))
    === JSON.stringify(comparableGameplayOutcomes(recordedGameplayOutcomes));
  const sameOutcomes = samePauseOutcomes && sameGameplayOutcomes;
  lastInputReplayEvidence = {
    accepted: replayReceipts.every((receipt) => receipt.accepted),
    sameOutcomes,
    recordHashes: records.map((record) => record.recordHash),
    replayHashes: replayReceipts.map((receipt) => receipt.replayHash),
    sourceOutcomes: [...recordedPauseOutcomes],
    replayOutcomes,
    sourceGameplayOutcomes: [...recordedGameplayOutcomes],
    replayGameplayOutcomes,
    samePauseOutcomes,
    sameGameplayOutcomes,
    duplicateRejected: duplicateReceipt !== null && !duplicateReceipt.accepted,
    duplicateDiagnostics: duplicateReceipt?.diagnostics.map((diagnostic) => diagnostic.code) ?? [],
    finalContext: replaySession.readInputContextState(),
    finalTime: replaySession.readTimeControlState(),
  };
  return lastInputReplayEvidence;
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
    animationSampledCue: lastAnimationSampledCueEvidence,
    presentationDegradation: lastPresentationDegradationEvidence,
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
  const transition = lastAnimationProjectionEvidence.controller?.transition;
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
  const readout = runtimeGateway.readGameplayRuntime();
  const state = runtimeGateway.readGameplayChallengeState();
  const objectivePoints = readChallengeObjectivePoints();
  if (readout === null || state === null) {
    return {
      status: 'unavailable',
      score: 0,
      objectivePoints,
      closeRangeHits: 0,
      triggerEntries: 0,
      registryDigest: null,
      bindingRegistryHash: null,
      lastReactionFrameHash: null,
    };
  }
  return {
    ...state,
    objectivePoints: state.objectivePoints ?? objectivePoints,
    registryDigest: readout.gameplayRegistryDigest,
    bindingRegistryHash: readout.bindingRegistryHash,
    reactionFrameCount: readout.reactionFrameCount,
    lastReactionFrameHash: readout.lastReactionFrameHash,
    runtimeHostHash: readout.runtimeHostHash,
    moduleStateHash: readout.moduleStateHash,
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

function tickHud(now = performance.now()) {
  hudFrameCount += 1;
  drainResolvedInputDeliveries();
  const frameTimeMs = Math.max(0, now - lastTelemetryFrameMs);
  lastTelemetryFrameMs = now;
  billboardHost?.refreshLayout();
  particleHost?.advance(1 / 60);
  const animationReceipt = animationHost.advance(1 / 60);
  for (const cue of animationReceipt.cues) {
    void realizeAnimationSampledCue(cue);
  }
  if (lastTelemetrySampleMs === 0 || now - lastTelemetrySampleMs >= 250) {
    sampleLiveTelemetry(now, frameTimeMs);
    lastTelemetrySampleMs = now;
  }
  renderHud();
  animationFrame = window.requestAnimationFrame(tickHud);
}

function sampleLiveTelemetry(elapsedMs, frameTimeMs) {
  const ecrp = readEcrpRuntimeReadout();
  const runtimeProjection = runtimeGateway.readProjection();
  const counters = {
    entityCount: ecrp.entityCount,
    activeCapabilityCount: ecrp.entities.reduce(
      (total, entity) => total + entity.capabilities.length,
      0,
    ),
    residentChunkCount: null,
    dirtyChunkCount: null,
    renderDiffCount: runtimeProjection?.renderDiffCount ?? null,
    renderHandleCount: surface.projectionSnapshot().nodes.length,
    drawCallCount: null,
    activeAudioSourceCount: audioHost?.readout().activeSources ?? null,
    activeBillboardCount: billboardHost?.readout().activeBillboards ?? null,
    activeParticleCount: particleHost?.readout().activeParticles ?? null,
    droppedFeedbackCount: particleHost?.readout().droppedParticles ?? null,
  };
  const input = {
    authorityTick: readRuntimeTelemetry().tick,
    frameTimeMs,
    counters,
  };
  if (telemetryOverlayHost === null) {
    return liveTelemetryCollector.sample(input);
  }
  return telemetryOverlayHost.sample(input, elapsedMs);
}

renderHud();
restartEnemyLoopCadence();
tickHud();

(globalThis as any).ashaRendererSurface = {
  kind: surface.kind,
  cameraPose: () => surface.cameraPose(),
  firePrimary: () => firePrimary(),
  enemyLoopState: () => lastEnemyPolicyReadout,
  gameplayTransformState: () => lastGameplayTransform,
  interactionState: () => readRuntimeInteractionState(),
  inputAuthorityState: () => readInputAuthorityState(),
  replayRecordedInput: () => replayRecordedInput(),
  movementState: () => surface.movementState(),
  pointerLocked: () => surface.pointerLocked(),
  projectContentStatus: () => ({
    ...readDemoProjectContentStatus(demoProjectContent),
    levelRenderProjectionHash: generatedTunnelReadout.renderProjection.hash,
    levelSurfaceLabels: ['generated-tunnel-floor', demoProjectContent.runtime.enemyRenderTarget.label],
    runtimeBackend: runtimeBackend.status,
    runtimeBackendDiagnostics: runtimeBackend.diagnostics,
    generatedTunnelOperation: runtimeBackend.generatedTunnelOperation,
    runtimeBackendProfile: runtimeBackend.profile,
    runtimeLoaded: runtimeBackend.available && ecrpProjectLoadReceipt.accepted,
    runtimeBootstrapHash: ecrpProjectLoadReceipt.bootstrapHash,
  }),
  reset: () => resetLoop(),
  runtimeBackendStatus: () => runtimeBackend,
  runtimeCollisionEvidence: () => lastCollisionReceipt,
  runtimeEcrpReadout: () => readEcrpRuntimeReadout(),
  runtimeTelemetry: () => readRuntimeTelemetry(),
  audioProjectionEvidence: () => lastAudioProjectionEvidence,
  audioProjectionReadout: () => audioHost?.readout() ?? null,
  billboardProjectionEvidence: () => lastBillboardProjectionEvidence,
  billboardProjectionReadout: () => billboardHost?.readout() ?? null,
  particleProjectionEvidence: () => lastParticleProjectionEvidence,
  particleProjectionReadout: () => particleHost?.readout() ?? null,
  liveTelemetrySnapshot: () => liveTelemetryCollector.tryReadSnapshot(),
  telemetryOverlayEvidence: () => lastTelemetryOverlayEvidence,
  telemetryOverlayReadout: () => telemetryOverlayHost?.readout() ?? null,
  animationProjectionEvidence: () => lastAnimationProjectionEvidence,
  animationProjectionReadout: () => animationHost.readout(),
  animationSampledCueEvidence: () => lastAnimationSampledCueEvidence,
  presentationDegradationEvidence: () => lastPresentationDegradationEvidence,
  exercisePresentationDegradation: (domain) => exercisePresentationDegradation(domain),
  integratedFeedbackEvidence: () => lastIntegratedFeedbackEvidence,
  rebuildPresentationHosts: () => rebuildPresentationHosts(),
  toggleTelemetryOverlay: () => telemetryOverlayHost?.toggleVisible(telemetryOverlay) ?? null,
  gameplayRuntimeReadout: () => runtimeGateway.readGameplayRuntime(),
  composedRuntimeReadout: () => runtimeGateway.readComposedRuntimeSession(),
  prefabAuthoringReadout: () => demoProjectContent.prefabAuthoring.readout,
  prefabInteractionReceipt: () => runtimeBackend.prefabInteractionReceipt,
  prefabPlacementProjection: () => prefabPlacementProjection,
  gameplayChallengeState: () => readGameplayChallenge(),
  animationIntent: () => animationIntent,
  animationFrameReceipt: () => animationFrameReceipt,
  animationPlayback: () => readAnimationPlayback(),
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
  return null;
}
}
