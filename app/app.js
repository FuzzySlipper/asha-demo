import {
  createAshaRendererGeneratedTunnelRoomSurfaceFrame,
  mountAshaRendererSurface,
} from '@asha/renderer-host';
import {
  RuntimeBridgeError,
  TINY_GENERATED_TUNNEL_READOUT,
  createRuntimeSessionFacade,
  readRuntimeSessionPlayableLoopState,
} from '@asha/runtime-bridge';
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

const runtimeBackend = await createDemoRuntimeBackend(demoProjectContent);
const runtimeSession = runtimeBackend.session;
const ecrpProjectLoadReceipt = runtimeBackend.loadReceipt;

let runtimeCamera = createRuntimeCamera();
let enemyPolicyTick = 0;
let paused = false;
let menuMode = 'closed';
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
let lastMovementEvent = 'Authority ready';
let lastRuntimeEvent = 'Runtime ready';
let reticlePulseTimer = null;

function createRuntimeCamera() {
  if (runtimeSession === null) {
    return {
      handle: -1,
      pose: demoProjectContent.runtime.initialCameraPose,
      projection: demoProjectContent.runtime.cameraProjection,
      viewport: readViewport(),
    };
  }
  return runtimeSession.createCamera({
    initialPose: demoProjectContent.runtime.initialCameraPose,
    projection: demoProjectContent.runtime.cameraProjection,
    viewport: readViewport(),
  }).snapshot.camera;
}

function constrainCameraMovement(input) {
  if (runtimeSession === null) {
    lastMovementEvent = runtimeBackend.diagnostics[0]?.message ?? 'Movement blocked: Rust runtime backend missing';
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
  const playable = readPlayableLoopState();
  if (runtimeSession === null || !playable.commands.canFire) {
    lastRuntimeEvent = readFireBlockedEvent(playable.commands.blockedReasons);
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
    tick: playable.counters.actionTick,
    source: 'browser_fps_pointer',
    pressed: true,
  });

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
  if (runtimeSession === null) {
    runtimeCamera = createRuntimeCamera();
    enemyPolicyTick = 0;
    lastEnemyPolicyReadout = null;
    paused = false;
    menuMode = 'closed';
    lastMovementEvent = 'Reset unavailable: Rust runtime backend missing';
    lastRuntimeEvent = lastMovementEvent;
    surface.reset();
    projectRuntimeTargetState();
    pulseReticle('miss');
    renderHud();
    return;
  }

  const statusBefore = readLifecycleStatus();
  const restartReceipt = runtimeSession.requestSessionRestart({
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
  const lifecycle = readLifecycleStatus();
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
    eventState.textContent = runtimeSession === null
      ? runtimeBackend.diagnostics[0]?.message ?? 'Rust runtime backend missing'
      : lifecycle.player.dead
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
    fireButton.disabled = !interaction.canFire;
    fireButton.dataset.blocked = String(!interaction.canFire);
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
  const lifecycle = readLifecycleStatus();
  if (runtimeSession === null) {
    lastRuntimeEvent = 'Enemy loop blocked: Rust runtime backend missing';
    renderHud();
    return lastEnemyPolicyReadout;
  }
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
  const playable = readPlayableLoopState();
  return {
    actionTick: playable.counters.actionTick,
    canFire: playable.commands.canFire,
    fireBlockedReasons: [...playable.commands.blockedReasons],
    hits: playable.counters.hits,
    lastEvent: lastRuntimeEvent,
    lastMenuIntent,
    lifecycleOutcome: readLifecycleStatus().outcome.kind,
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
  if (runtimeSession !== null) {
    return readRuntimeSessionPlayableLoopState(runtimeSession, {
      shell: {
        paused,
        menuMode,
      },
    });
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

async function createDemoRuntimeBackend(content) {
  const profile = {
    kind: 'asha_demo.runtime_backend_profile.v1',
    mode: 'rust',
    transport: 'public_runtime_bridge',
    providerGlobal: 'globalThis.ashaDemoRuntimeBridge',
    providerContract: 'asha_demo.native_runtime_bridge_provider.v1',
    requiredBackend: 'native_rust',
    productAuthority: true,
    referenceFallback: false,
  };

  try {
    const provider = readInjectedRuntimeBridgeProvider();
    if (provider === null) {
      return unavailableRuntimeBackend(
        profile,
        'missing_rust_runtime_backend',
        'ASHA demo requires a public native Rust RuntimeBridge provider; static browser mode does not fall back to reference authority.',
      );
    }

    const bridge = await readProvidedRuntimeBridge(provider);
    if (bridge === null) {
      return unavailableRuntimeBackend(
        profile,
        'missing_rust_runtime_backend',
        'ASHA demo RuntimeBridge provider did not return a bridge; reference authority is not accepted.',
      );
    }

    const session = createRuntimeSessionFacade({ bridge, mode: 'rust' });
    session.initialize({
      sessionId: content.runtime.sessionId,
      seed: content.runtime.seed,
      project: content.projectBundle.project,
      projectBundle: content.projectBundle.runtimeRequest,
    });
    const loadReceipt = session.loadEcrpProject({
      kind: 'runtime_session.load_ecrp_project.v0',
      projectBundle: content.projectBundle,
      entityDefinitions: content.entityDefinitions,
      sceneDocument: content.sceneDocument,
    });

    if (!loadReceipt.accepted) {
      return unavailableRuntimeBackend(
        profile,
        'rust_runtime_rejected_project',
        `Rust RuntimeSession rejected demo ECRP content: ${formatLoadDiagnostics(loadReceipt.diagnostics)}`,
        loadReceipt,
        'rust_backend_failed',
      );
    }
    assertNativeRustAuthority({ bridge, session, profile });

    return {
      available: true,
      status: 'rust_authority',
      session,
      loadReceipt,
      diagnostics: [],
      profile,
      backendHash: loadReceipt.bootstrapHash ?? 'rust-authority:loaded',
    };
  } catch (error) {
    const diagnostic = errorToBackendDiagnostic(error);
    return unavailableRuntimeBackend(profile, diagnostic.code, diagnostic.message);
  }
}

function readInjectedRuntimeBridgeProvider() {
  const provider = globalThis.ashaDemoRuntimeBridge ?? globalThis.ashaRuntimeBridge ?? null;
  if (provider === null) {
    return null;
  }
  if (!isNativeRustRuntimeBridgeProvider(provider)) {
    throw new RuntimeBridgeError(
      'invalid_input',
      'globalThis.ashaDemoRuntimeBridge must be an asha_demo.native_runtime_bridge_provider.v1 provider with native_rust authority metadata; raw RuntimeBridge/reference providers are rejected.',
    );
  }
  return provider;
}

async function readProvidedRuntimeBridge(provider) {
  const candidate = typeof provider === 'function'
    ? provider()
    : typeof provider.createRuntimeBridge === 'function'
      ? provider.createRuntimeBridge()
      : provider.bridge ?? provider;
  const bridge = await candidate;
  if (isRuntimeBridge(bridge)) {
    return bridge;
  }
  throw new RuntimeBridgeError(
    'invalid_input',
    'globalThis.ashaDemoRuntimeBridge must provide the public RuntimeBridge interface',
  );
}

function isNativeRustRuntimeBridgeProvider(value) {
  return value !== null
    && (typeof value === 'object' || typeof value === 'function')
    && value.kind === 'asha_demo.native_runtime_bridge_provider.v1'
    && value.productAuthority === true
    && value.referenceFallback === false
    && value.backend === 'native_rust';
}

function isRuntimeBridge(value) {
  return value !== null
    && typeof value === 'object'
    && typeof value.initializeEngine === 'function'
    && typeof value.loadWorldBundle === 'function'
    && typeof value.loadFpsRuntimeSession === 'function'
    && typeof value.readFpsRuntimeSession === 'function'
    && typeof value.applyFpsPrimaryFire === 'function';
}

function assertNativeRustAuthority({ bridge, session, profile }) {
  const readout = session.readEcrpRuntimeReadout();
  const snapshot = bridge.readFpsRuntimeSession();
  if (
    readout.authority.mode !== 'rust'
    || readout.authority.source !== 'rust_bridge'
    || snapshot.backend !== profile.requiredBackend
  ) {
    throw new RuntimeBridgeError(
      'invalid_input',
      `ASHA demo rejected non-native RuntimeBridge provider: ECRP source=${readout.authority.source}, FPS backend=${snapshot.backend}`,
    );
  }
}

function unavailableRuntimeBackend(profile, code, message, loadReceipt = null, status = 'missing_rust_backend') {
  return {
    available: false,
    status,
    session: null,
    loadReceipt: loadReceipt ?? {
      kind: 'runtime_session.ecrp_project_load_receipt.v0',
      sequenceId: 0,
      accepted: false,
      diagnostics: [{ code, path: 'runtime.backend', detail: message }],
      entityCount: 0,
      bootstrapHash: null,
      sessionHashBefore: 'missing-rust-backend',
      sessionHashAfter: 'missing-rust-backend',
    },
    diagnostics: [{ code, severity: 'error', message }],
    profile,
    backendHash: `missing-rust-backend:${code}`,
  };
}

function errorToBackendDiagnostic(error) {
  if (error instanceof RuntimeBridgeError) {
    return {
      code: error.kind === 'native_unavailable' ? 'missing_rust_runtime_backend' : error.kind,
      message: error.message,
    };
  }
  return {
    code: 'runtime_backend_error',
    message: error instanceof Error ? error.message : String(error),
  };
}

function formatLoadDiagnostics(diagnostics) {
  return diagnostics
    .map((diagnostic) => `${diagnostic.code}:${diagnostic.path}`)
    .join('; ');
}

function readViewport() {
  return {
    width: canvas.clientWidth || 1280,
    height: canvas.clientHeight || 720,
  };
}

function readLifecycleStatus() {
  if (runtimeSession !== null) {
    return runtimeSession.readLifecycleStatus();
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
  if (runtimeSession !== null) {
    return runtimeSession.readEcrpRuntimeReadout();
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
  if (runtimeSession !== null) {
    return runtimeSession.readTelemetry();
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
