import {
  BrowserFpsInputCollector,
  RuntimeBridgeError,
  createMockRuntimeSession,
  validateEnemyPolicySource,
} from '@asha/runtime-bridge';
import { renderFirstPersonTunnelViewport } from '@asha/renderer-three';

const FIRST_PERSON_VIEWPORT_KIND = 'first_person_tunnel_viewport.v0';

const fallbackStatus = {
  manifest: { present: false },
  allowedImports: [],
  sourceRoots: [],
  nonClaims: ['Reference playable loop unavailable until /api/status responds.'],
};

const response = await fetch('/api/status', { headers: { Accept: 'application/json' } }).catch(() => null);
const status = response?.ok ? await response.json() : fallbackStatus;
const movementDemo = createPlayableLoopDemo(status.publicAshaReadout?.playableLoop?.hudOverlay ?? null);

renderManifest(status.manifest);
renderPublicAshaReadout(status.publicAshaReadout);
renderGeneratedTunnelReadout(status.publicAshaReadout?.generatedTunnel);
renderAllDemoReadouts(movementDemo);
renderCombatHudReadout(status.publicAshaReadout?.combatHud);
wireMovementControls(movementDemo);
renderList(document.querySelector('#allowed-imports'), status.allowedImports);
renderList(document.querySelector('#source-roots'), status.sourceRoots);
renderList(document.querySelector('#non-claims'), status.nonClaims);

function createPlayableLoopDemo(hudOverlaySurface) {
  const session = createMockRuntimeSession();
  const initialized = initializeRuntimeSession();
  let input = null;
  let tick = 0;
  let latestCamera = null;
  let latestFrame = null;
  let latestCollision = null;
  let latestError = null;
  let latestAutonomousTick = null;
  let latestCombatAction = null;
  let latestLifecycle = null;
  let latestRestart = null;
  let latestHudIntent = null;
  let latestPlayerDefeatFixture = null;
  let generatedTunnel = null;
  let latestFirstPersonViewport = null;
  let loop = null;

  resetCameraAndInput();
  refreshReferenceReadouts();

  return {
    activatePointerFallback() {
      input.setPointerLockActive(true);
      latestError = null;
      return this.readout();
    },
    deactivatePointerFallback() {
      input.setPointerLockActive(false);
      latestError = null;
      stopLoop();
      return this.readout();
    },
    keyDown(event) {
      input.handleKeyDown(event);
      latestError = null;
      startLoop();
      return this.readout();
    },
    keyUp(event) {
      input.handleKeyUp(event);
      if (!hasHeldInput()) {
        stopLoop();
      }
      return this.readout();
    },
    mouseMove(event) {
      input.handleMouseMove(event);
      latestError = null;
      startLoop();
      return this.readout();
    },
    nudge(code) {
      input.handleKeyDown({ code });
      this.step();
      input.handleKeyUp({ code });
      return this.readout();
    },
    look(movementX, movementY) {
      input.setPointerLockActive(true);
      input.handleMouseMove({ movementX, movementY });
      this.step();
      return this.readout();
    },
    step() {
      tick += 1;
      const frame = input.drainFrame({ tick, dtSeconds: 1 / 10 });
      applyCollisionFrame(frame.runtimeCommand.envelope.input, frame);
      return this.readout();
    },
    probeWallStop() {
      stopLoop();
      tick += 1;
      resetCameraAndInput();
      applyCollisionFrame({
        moveForward: 1,
        moveRight: 0,
        moveUp: 0,
        yawDeltaDegrees: 0,
        pitchDeltaDegrees: 0,
        dtSeconds: 1,
        moveSpeedUnitsPerSecond: 99,
      });
      return this.readout();
    },
    firePrimary() {
      tick += 1;
      const receipt = session.submitRuntimeActionIntent({
        kind: 'runtime_action_intent.v0',
        action: 'primary_fire',
        phase: 'pressed',
        camera: latestCamera.camera,
        tick,
        source: 'programmatic',
        pressed: true,
      });
      latestCombatAction = {
        tick,
        receipt,
      };
      latestLifecycle = session.readLifecycleStatus();
      return latestCombatAction;
    },
    runEnemyPolicy() {
      tick += 1;
      latestAutonomousTick = session.runAutonomousPolicyTick({
        targetCamera: latestCamera.camera,
        tick,
        policySource: 'export const policy = (view) => view;',
      });
      latestLifecycle = session.readLifecycleStatus();
      return this.enemyPolicyReadout();
    },
    restartLoop(source = 'programmatic') {
      stopLoop();
      const statusBefore = latestLifecycle ?? session.readLifecycleStatus();
      latestRestart = session.requestSessionRestart({
        kind: 'runtime.restart_session_intent',
        source,
        requireTerminal: true,
        expectedSessionHash: statusBefore.sessionHash,
      });
      if (latestRestart.accepted) {
        tick = 0;
        latestAutonomousTick = null;
        latestCombatAction = null;
        resetCameraAndInput();
      }
      refreshReferenceReadouts();
      return latestRestart;
    },
    handleHudControl(controlId) {
      const intent = hudIntentFor(controlId);
      if (intent === null) {
        latestHudIntent = {
          controlId,
          intent: null,
          status: 'rejected',
          reason: 'unknown_hud_control',
        };
        return latestHudIntent;
      }
      if (intent.kind === 'runtime.restart_session_intent') {
        const restartReceipt = this.restartLoop(intent.source);
        latestHudIntent = {
          controlId,
          intent,
          status: restartReceipt.status,
          reason: restartReceipt.rejection?.reason ?? null,
          restartReceipt,
        };
        return latestHudIntent;
      }
      latestHudIntent = {
        controlId,
        intent,
        status: 'unsupported',
        reason:
          intent.kind === 'ui.open_options_intent'
            ? 'options_menu_not_implemented'
            : intent.kind === 'ui.exit_to_menu_intent'
              ? 'exit_to_menu_not_implemented'
              : 'resume_menu_state_not_implemented',
      };
      return latestHudIntent;
    },
    combatActionReadout() {
      return latestCombatAction;
    },
    enemyPolicyReadout() {
      return {
        statusVersion: 'asha-demo-enemy-policy.v1',
        publicImports: ['@asha/runtime-bridge'],
        policySourcePath: 'policies/README.md',
        tick,
        autonomousTick: latestAutonomousTick,
        sourceGuard: {
          cleanDiagnostics: validateEnemyPolicySource('export const policy = (view) => [];'),
          forbiddenDiagnostics: validateEnemyPolicySource('Date.now(); Math.random(); fetch("/state"); window.location.href;'),
        },
        nonClaims: [
          'not_demo_local_policy_authority',
          'not_demo_local_enemy_movement_authority',
          'movement_authority_not_wired',
        ],
      };
    },
    playableLoopReadout() {
      const movementReadout = this.readout();
      return {
        statusVersion: 'asha-demo-playable-loop.v0',
        publicImports: ['@asha/runtime-bridge'],
        runtimeSession: {
          sessionId: initialized.identity.sessionId,
          mode: initialized.identity.mode,
        },
        tick,
        movement: movementReadout,
        generatedTunnel,
        autonomousTick: latestAutonomousTick,
        combatAction: latestCombatAction,
        lifecycle: latestLifecycle ?? session.readLifecycleStatus(),
        restartReceipt: latestRestart,
        playerDefeatFixture: latestPlayerDefeatFixture,
        nonClaims: [
          'reference RuntimeSession loop, not native runtime attach',
          'enemy movement remains proposal-only: movement_authority_not_wired',
          'no local combat, collision, generation, nav, policy, or lifecycle authority',
          'no interactive renderer or pixel-rendered gameplay claim',
        ],
      };
    },
    firstPersonViewportReadout() {
      return latestFirstPersonViewport;
    },
    hudOverlayReadout() {
      const lifecycle = latestLifecycle ?? session.readLifecycleStatus();
      const targetHealth = lifecycle.enemy.health;
      const playerHealth = lifecycle.player.health;
      const targetProjectionHealth = projectHudHealth(targetHealth);
      const controls = hudOverlaySurface?.projection?.menu?.controls ?? fallbackHudControls();
      const projection = {
        kind: hudOverlaySurface?.projection?.kind ?? 'hud_projection.v0',
        health: targetProjectionHealth,
        status: [
          {
            id: 'lifecycle',
            tone: lifecycle.outcome.terminal ? 'danger' : 'info',
            text: lifecycle.outcome.label,
          },
          {
            id: 'restart',
            tone: latestRestart?.status === 'rejected' ? 'warning' : 'info',
            text: latestRestart === null ? 'Restart not requested' : `Restart ${latestRestart.status}`,
          },
          {
            id: 'enemy-movement',
            tone: 'warning',
            text: 'movement_authority_not_wired',
          },
        ],
        nonClaims: hudOverlaySurface?.projection?.nonClaims ?? [
          'not_ui_authority',
          'not_options_or_exit_implementation',
          'not_native_runtime',
        ],
        menu: {
          open: true,
          controls,
        },
      };
      return {
        statusVersion: 'asha-demo-hud-overlay.v0',
        publicImports: ['@asha/ui-dom', '@asha/runtime-bridge'],
        projection,
        playerHealth: projectHudHealth(playerHealth),
        targetHealth: targetProjectionHealth,
        lifecycle,
        restartReceipt: latestRestart,
        lastHudIntent: latestHudIntent,
        menuIntents: hudOverlaySurface?.menuIntents ?? fallbackHudIntents(),
        unsupportedControls: hudOverlaySurface?.unsupportedControls ?? [
          {
            controlId: 'hud-options',
            status: 'unsupported',
            reason: 'options_menu_not_implemented',
          },
          {
            controlId: 'hud-exit',
            status: 'unsupported',
            reason: 'exit_to_menu_not_implemented',
          },
        ],
      };
    },
    readout() {
      const inputReadout = input.readout();
      return {
        statusVersion: 'asha-demo-browser-movement.v0',
        publicImports: ['@asha/runtime-bridge'],
        runtimeSession: {
          sessionId: initialized.identity.sessionId,
          mode: initialized.identity.mode,
          nonClaims: initialized.identity.nonClaims,
        },
        tick,
        pose: latestCamera.pose,
        input: inputReadout,
        latestFrame,
        latestCollision,
        latestError,
      };
    },
  };

  function initializeRuntimeSession() {
    return session.initialize({
      sessionId: 'asha-demo:browser-static-room:movement',
      seed: 4068,
      project: {
        gameId: 'asha-demo',
        workspaceId: 'asha-demo-local',
      },
      projectBundle: {
        bundleSchemaVersion: 1,
        protocolVersion: 1,
        sceneId: 1001,
      },
    });
  }

  function resetCameraAndInput() {
    const cameraReceipt = createStaticRoomCamera();
    input = new BrowserFpsInputCollector({
      camera: cameraReceipt.snapshot.camera,
      moveSpeedUnitsPerSecond: 3,
      mouseSensitivityDegreesPerPixel: 0.1,
      pointerLocked: false,
    });
    latestCamera = cameraReceipt.snapshot;
    latestFrame = null;
    latestCollision = null;
    latestError = null;
  }

  function refreshReferenceReadouts() {
    generatedTunnel = session.readGeneratedTunnelReadout({
      presetId: 'tiny-enclosed',
      seed: 17,
    });
    latestLifecycle = session.readLifecycleStatus();
    latestPlayerDefeatFixture = session.readLifecycleStatus({ scenario: 'generated_tunnel_player_defeated' });
    refreshFirstPersonViewport();
  }

  function hudIntentFor(controlId) {
    const intents = hudOverlaySurface?.menuIntents ?? fallbackHudIntents();
    if (controlId === 'hud-resume') {
      return intents.resume ?? null;
    }
    if (controlId === 'hud-restart') {
      return intents.restart ?? null;
    }
    if (controlId === 'hud-options') {
      return intents.options ?? null;
    }
    if (controlId === 'hud-exit') {
      return intents.exit ?? null;
    }
    return null;
  }

  function applyCollisionFrame(cameraInput, frame = null) {
    try {
      latestFrame = frame;
      latestCollision = session.applyCollisionConstrainedCameraInput({
        camera: latestCamera.camera,
        grid: 1,
        input: cameraInput,
        tick,
        shape: {
          halfExtents: [0.25, 0.25, 0.25],
        },
        policy: {
          mode: 'axis_separable_slide',
          maxIterations: 3,
        },
      });
      latestCamera = latestCollision.snapshot.after;
      latestError = null;
      refreshFirstPersonViewport();
    } catch (error) {
      latestError =
        error instanceof RuntimeBridgeError
          ? `${error.kind}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
    }
  }

  function refreshFirstPersonViewport() {
    if (generatedTunnel === null || latestCamera === null) {
      return;
    }
    try {
      const cameraProjection = session.readCameraProjection({
        camera: latestCamera.camera,
        viewport: null,
      }).snapshot;
      latestFirstPersonViewport = {
        status: 'rendered',
        publicImports: ['@asha/renderer-three', '@asha/runtime-bridge'],
        result: renderFirstPersonTunnelViewport({
          tunnel: generatedTunnel,
          camera: cameraProjection,
          collision:
            latestCollision === null
              ? null
              : {
                  collided: latestCollision.collided,
                  blockedAxes: latestCollision.blockedAxes,
                  worldHash: latestCollision.worldHash,
                  collisionProjectionHash: latestCollision.collisionProjectionHash,
                  movementHash: latestCollision.movementHash,
                },
        }),
        error: null,
      };
    } catch (error) {
      latestFirstPersonViewport = {
        status: 'fallback',
        publicImports: ['@asha/renderer-three', '@asha/runtime-bridge'],
        result: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  function createStaticRoomCamera() {
    return session.createCamera({
      initialPose: {
        position: [0, 1.6, 0],
        yawDegrees: 0,
        pitchDegrees: 0,
      },
      projection: {
        fovYDegrees: 60,
        near: 0.1,
        far: 100,
      },
      viewport: {
        width: 1280,
        height: 720,
      },
    });
  }

  function hasHeldInput() {
    const readout = input.readout();
    return readout.moveForward !== 0 || readout.moveRight !== 0 || readout.pendingMouseDelta.some((value) => value !== 0);
  }

  function startLoop() {
    if (loop !== null) {
      return;
    }
    loop = window.setInterval(() => {
      if (!hasHeldInput()) {
        stopLoop();
        renderAllDemoReadouts(movementDemo);
        return;
      }
      movementDemo.step();
      renderAllDemoReadouts(movementDemo);
    }, 100);
  }

  function stopLoop() {
    if (loop === null) {
      return;
    }
    window.clearInterval(loop);
    loop = null;
  }
}

function wireMovementControls(demo) {
  const surface = document.querySelector('#movement-surface');
  const pointerButton = document.querySelector('#movement-pointer');
  const releaseButton = document.querySelector('#movement-release');
  const stepButton = document.querySelector('#movement-step');
  const wallButton = document.querySelector('#movement-wall-probe');
  const fireButton = document.querySelector('#combat-fire');
  const enemyPolicyButton = document.querySelector('#enemy-policy-run');
  const restartButton = document.querySelector('#loop-restart');
  const actionButtons = document.querySelectorAll('[data-movement-action]');

  pointerButton.addEventListener('click', () => {
    demo.activatePointerFallback();
    renderAllDemoReadouts(demo);
    surface.focus();
  });
  releaseButton.addEventListener('click', () => {
    demo.deactivatePointerFallback();
    renderAllDemoReadouts(demo);
  });
  stepButton.addEventListener('click', () => {
    demo.step();
    renderAllDemoReadouts(demo);
  });
  wallButton.addEventListener('click', () => {
    demo.probeWallStop();
    renderAllDemoReadouts(demo);
  });
  fireButton.addEventListener('click', () => {
    demo.firePrimary();
    renderAllDemoReadouts(demo);
  });
  enemyPolicyButton.addEventListener('click', () => {
    demo.runEnemyPolicy();
    renderAllDemoReadouts(demo);
  });
  restartButton.addEventListener('click', () => {
    demo.restartLoop();
    renderAllDemoReadouts(demo);
  });

  for (const button of actionButtons) {
    button.addEventListener('click', () => {
      const action = button.dataset.movementAction;
      if (action === 'forward') {
        demo.nudge('KeyW');
      } else if (action === 'back') {
        demo.nudge('KeyS');
      } else if (action === 'left') {
        demo.nudge('KeyA');
      } else if (action === 'right') {
        demo.nudge('KeyD');
      } else if (action === 'look-left') {
        demo.look(-18, 0);
      } else if (action === 'look-right') {
        demo.look(18, 0);
      } else if (action === 'look-up') {
        demo.look(0, -12);
      } else if (action === 'look-down') {
        demo.look(0, 12);
      }
      renderAllDemoReadouts(demo);
    });
  }

  surface.addEventListener('keydown', (event) => {
    demo.keyDown(event);
    renderAllDemoReadouts(demo);
  });
  surface.addEventListener('keyup', (event) => {
    demo.keyUp(event);
    renderAllDemoReadouts(demo);
  });
  surface.addEventListener('mousemove', (event) => {
    demo.mouseMove(event);
    renderAllDemoReadouts(demo);
  });
}

function renderAllDemoReadouts(demo) {
  renderFirstPersonViewportReadout(demo.firstPersonViewportReadout());
  renderHudOverlayReadout(demo.hudOverlayReadout(), demo);
  renderPlayableLoopReadout(demo.playableLoopReadout());
  renderMovementReadout(demo.readout());
  renderCombatActionReceipt(demo.combatActionReadout());
  renderEnemyPolicyReadout(demo.enemyPolicyReadout());
}

function renderFirstPersonViewportReadout(readout) {
  const canvas = document.querySelector('#first-person-canvas');
  const status = document.querySelector('#first-person-status');
  const facts = document.querySelector('#first-person-summary');
  const snapshot = document.querySelector('#first-person-snapshot');
  facts.replaceChildren();
  snapshot.replaceChildren();

  if (readout === null || readout === undefined) {
    status.textContent = 'Fallback';
    appendFact(facts, 'Status', 'waiting for RuntimeSession camera projection');
    drawViewportFallback(canvas, 'waiting for camera projection');
    return;
  }

  if (readout.status !== 'rendered' || readout.result === null) {
    status.textContent = 'Typed fallback';
    appendFact(facts, 'Status', 'typed fallback');
    appendFact(facts, 'Error', readout.error ?? 'unknown');
    drawViewportFallback(canvas, readout.error ?? 'typed fallback');
    return;
  }

  const summary = readout.result.summary;
  const pixelHash = drawViewportCanvas(canvas, summary);
  status.textContent = summary.kind;
  const rows = [
    ['Status', 'canvas drawn from public renderer-three viewport summary'],
    ['Fixture', summary.fixture],
    ['Preset / seed', `${summary.presetId} / ${summary.seed}`],
    ['Camera position', formatVector(summary.camera.position)],
    ['Yaw / pitch', `${summary.camera.yawDegrees.toFixed(1)} / ${summary.camera.pitchDegrees.toFixed(1)}`],
    ['Camera projection hash', summary.camera.projectionHash],
    ['Tunnel dims', summary.tunnel.dims.join('x')],
    ['Scene ops / instances', `${summary.scene.opCount} / ${summary.scene.instanceCount}`],
    ['Frame hash', summary.scene.frameHash],
    ['Structural hash', summary.scene.structuralHash],
    ['Output hash', summary.debug.outputHash],
    ['Render projection hash', summary.debug.renderProjectionHash],
    ['Collision projection hash', summary.debug.collisionProjectionHash],
    ['Collision debug', summary.debug.collision?.collided ? `blocked ${summary.debug.collision.blockedAxes.join(', ')}` : 'none'],
    ['Canvas pixel hash', pixelHash],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }

  for (const line of readout.result.structuralSnapshot.trim().split('\n').slice(0, 5)) {
    const item = document.createElement('li');
    item.textContent = line;
    snapshot.append(item);
  }
  for (const claim of summary.nonClaims) {
    const item = document.createElement('li');
    item.textContent = claim;
    snapshot.append(item);
  }
}

function drawViewportCanvas(canvas, summary) {
  const context = canvas.getContext('2d');
  if (context === null) {
    return 'canvas_context_unavailable';
  }
  const width = canvas.width;
  const height = canvas.height;
  const yawRadians = (summary.camera.yawDegrees * Math.PI) / 180;
  const pitchOffset = Math.max(-0.2, Math.min(0.2, summary.camera.pitchDegrees / 90)) * height;
  const centerX = width / 2 + Math.sin(yawRadians) * width * 0.12;
  const horizonY = height * 0.44 + pitchOffset;

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#122235');
  gradient.addColorStop(0.55, '#1c3444');
  gradient.addColorStop(1, '#26372f');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#3f4f54';
  context.beginPath();
  context.moveTo(centerX - width * 0.12, horizonY);
  context.lineTo(0, height);
  context.lineTo(width, height);
  context.lineTo(centerX + width * 0.12, horizonY);
  context.closePath();
  context.fill();

  context.fillStyle = '#657079';
  context.beginPath();
  context.moveTo(centerX - width * 0.12, horizonY);
  context.lineTo(0, 0);
  context.lineTo(0, height);
  context.closePath();
  context.fill();

  context.fillStyle = '#596774';
  context.beginPath();
  context.moveTo(centerX + width * 0.12, horizonY);
  context.lineTo(width, 0);
  context.lineTo(width, height);
  context.closePath();
  context.fill();

  context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  context.lineWidth = 2;
  for (let index = 0; index < 6; index += 1) {
    const t = index / 5;
    const y = horizonY + (height - horizonY) * t * t;
    context.beginPath();
    context.moveTo(centerX - width * (0.12 + t * 0.78), y);
    context.lineTo(centerX + width * (0.12 + t * 0.78), y);
    context.stroke();
  }
  for (const xOffset of [-0.55, -0.28, 0, 0.28, 0.55]) {
    context.beginPath();
    context.moveTo(centerX, horizonY);
    context.lineTo(centerX + xOffset * width, height);
    context.stroke();
  }

  context.fillStyle = '#31a9d8';
  context.fillRect(centerX - 8, horizonY + 28, 16, 16);
  context.fillStyle = '#c18cff';
  context.fillRect(centerX + width * 0.22, horizonY + 52, 18, 18);

  context.fillStyle = '#f5f8fb';
  context.font = '18px ui-monospace, SFMono-Regular, Consolas, monospace';
  context.fillText(summary.kind, 18, 30);
  context.font = '14px ui-monospace, SFMono-Regular, Consolas, monospace';
  context.fillText(`camera ${formatVector(summary.camera.position)} yaw ${summary.camera.yawDegrees.toFixed(1)}`, 18, 54);

  return sampleCanvasHash(context, width, height);
}

function drawViewportFallback(canvas, reason) {
  const context = canvas.getContext('2d');
  if (context === null) {
    return;
  }
  context.fillStyle = '#172637';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#f3f8fb';
  context.font = '18px ui-monospace, SFMono-Regular, Consolas, monospace';
  context.fillText(`first-person viewport fallback: ${reason}`, 18, 36);
}

function sampleCanvasHash(context, width, height) {
  const data = context.getImageData(0, 0, width, height).data;
  let hash = 0x811c9dc5;
  const stride = Math.max(4, Math.floor(data.length / 512));
  for (let index = 0; index < data.length; index += stride) {
    hash ^= data[index];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `canvas-fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function renderHudOverlayReadout(readout, demo) {
  const state = document.querySelector('#hud-overlay-state');
  const bars = document.querySelector('#hud-health-bars');
  const facts = document.querySelector('#hud-overlay-summary');
  const controls = document.querySelector('#hud-menu-controls');
  const statuses = document.querySelector('#hud-overlay-status');
  state.textContent = readout.lifecycle.outcome.label;
  bars.replaceChildren();
  facts.replaceChildren();
  controls.replaceChildren();
  statuses.replaceChildren();

  bars.append(createHudMeter('Player', readout.playerHealth), createHudMeter('Target', readout.targetHealth));

  const restartIntent = readout.menuIntents.restart;
  const optionIntent = readout.menuIntents.options;
  const exitIntent = readout.menuIntents.exit;
  const rows = [
    ['Projection', readout.projection.kind],
    ['Player health', readout.playerHealth.label],
    ['Target health', readout.targetHealth.label],
    ['Lifecycle', `${readout.lifecycle.outcome.kind} · ${readout.lifecycle.outcome.label}`],
    ['Restart intent', restartIntent?.kind ?? 'unavailable'],
    ['Options intent', optionIntent?.kind ?? 'unavailable'],
    ['Exit intent', exitIntent?.kind ?? 'unavailable'],
    [
      'Last HUD action',
      readout.lastHudIntent === null
        ? 'none'
        : `${readout.lastHudIntent.intent?.kind ?? readout.lastHudIntent.controlId} · ${readout.lastHudIntent.status}${readout.lastHudIntent.reason === null || readout.lastHudIntent.reason === undefined ? '' : ` · ${readout.lastHudIntent.reason}`}`,
    ],
    ['Controls', 'WASD/buttons plus mouse/look controls'],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }

  for (const control of readout.projection.menu.controls) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = control.label;
    button.disabled = control.disabled === true;
    button.dataset.hudControl = control.id;
    button.addEventListener('click', () => {
      demo.handleHudControl(control.id);
      renderAllDemoReadouts(demo);
    });
    controls.append(button);
  }

  for (const statusLine of readout.projection.status) {
    const item = document.createElement('li');
    item.textContent = `${statusLine.id}: ${statusLine.text}`;
    statuses.append(item);
  }
  for (const unsupported of readout.unsupportedControls) {
    const item = document.createElement('li');
    item.textContent = `${unsupported.controlId}: ${unsupported.status} (${unsupported.reason})`;
    statuses.append(item);
  }
  for (const claim of readout.projection.nonClaims) {
    const item = document.createElement('li');
    item.textContent = claim;
    statuses.append(item);
  }
}

function createHudMeter(label, health) {
  const meter = document.createElement('div');
  meter.className = health.dead ? 'hud-meter dead' : 'hud-meter';
  const labelRow = document.createElement('div');
  labelRow.className = 'hud-meter-label';
  const name = document.createElement('span');
  name.textContent = label;
  const value = document.createElement('strong');
  value.textContent = health.label;
  labelRow.append(name, value);
  const track = document.createElement('div');
  track.className = 'hud-meter-track';
  const fill = document.createElement('div');
  fill.className = 'hud-meter-fill';
  fill.style.setProperty('--hud-ratio', `${Math.round(health.ratio * 100)}%`);
  track.append(fill);
  meter.append(labelRow, track);
  return meter;
}

function renderPlayableLoopReadout(readout) {
  const facts = document.querySelector('#playable-loop-summary');
  const events = document.querySelector('#playable-loop-events');
  facts.replaceChildren();
  events.replaceChildren();

  const movement = readout.movement;
  const collision = movement.latestCollision;
  const autonomousTick = readout.autonomousTick;
  const movementSummary = autonomousTick?.movementSummary;
  const combatSummary = autonomousTick?.combatSummary;
  const combatHealth = readout.combatAction?.receipt.combatReadout?.health[0];
  const lifecycle = readout.lifecycle;
  const restart = readout.restartReceipt;
  const generated = readout.generatedTunnel;
  const rows = [
    ['Loop status', lifecycle.outcome.label],
    ['RuntimeSession', readout.runtimeSession.sessionId],
    ['Tick', String(readout.tick)],
    ['Position', formatVector(movement.pose.position)],
    ['Yaw / pitch', `${movement.pose.yawDegrees.toFixed(1)} / ${movement.pose.pitchDegrees.toFixed(1)}`],
    ['Collision', collision?.collided ? `blocked ${collision.blockedAxes.join(', ')}` : 'clear'],
    ['Movement hash', collision?.movementHash ?? 'not stepped'],
    ['Collision hash', collision?.collisionProjectionHash ?? 'not stepped'],
    ['Generated tunnel', `${generated.generator.presetId} · ${generated.generator.outputHash}`],
    ['Enemy tick', autonomousTick === null ? 'not run' : `${autonomousTick.kind} · tick ${autonomousTick.tick}`],
    [
      'Enemy proposals',
      autonomousTick === null
        ? 'not run'
        : `${autonomousTick.proposalSummary.acceptedProposalCount} accepted, ${autonomousTick.proposalSummary.unsupportedProposalCount} unsupported, ${autonomousTick.proposalSummary.rejectedProposalCount} rejected`,
    ],
    [
      'Enemy movement',
      movementSummary === undefined || movementSummary === null
        ? 'not run'
        : `${movementSummary.status} · ${movementSummary.reason}`,
    ],
    ['Nav path hash', autonomousTick?.nav.pathHash ?? 'not run'],
    [
      'Fire status',
      readout.combatAction === null
        ? combatSummary?.status ?? 'not fired'
        : readout.combatAction.receipt.status,
    ],
    [
      'Health',
      combatHealth === undefined
        ? `Enemy ${lifecycle.enemy.health.current}/${lifecycle.enemy.health.max}${lifecycle.enemy.dead ? ' defeated' : ''}`
        : `Health ${combatHealth.current}/${combatHealth.max}${combatHealth.dead ? ' defeated' : ''}`,
    ],
    ['Lifecycle', `${lifecycle.outcome.kind} · ${lifecycle.outcome.label}`],
    [
      'Restart',
      restart === null
        ? 'not requested'
        : `${restart.status}${restart.rejection === null ? '' : ` · ${restart.rejection.reason}`} -> ${restart.statusAfter.outcome.label}`,
    ],
    ['Player defeat fixture', `${readout.playerDefeatFixture.outcome.kind} · ${readout.playerDefeatFixture.outcome.label}`],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }

  const eventLines = [];
  if (autonomousTick !== null) {
    for (const receipt of autonomousTick.proposalReceipts) {
      eventLines.push(`${receipt.proposalKind}: ${receipt.status}${receipt.rejection === null ? '' : ` (${receipt.rejection.reason})`}`);
    }
  }
  for (const event of lifecycle.events) {
    eventLines.push(`${event.kind}: ${event.reason}`);
  }
  if (restart !== null) {
    eventLines.push(`${restart.kind}: ${restart.status}`);
  }
  for (const claim of readout.nonClaims) {
    eventLines.push(claim);
  }

  for (const line of eventLines) {
    const item = document.createElement('li');
    item.textContent = line;
    events.append(item);
  }
}

function renderManifest(manifest) {
  const facts = document.querySelector('#manifest-summary');
  facts.replaceChildren();
  const rows = [
    ['Status', manifest.present ? 'Found' : 'Missing'],
    ['Engine source', manifest.engineSource ?? 'not declared'],
    ['Runtime command', manifest.runtimeCommand ?? 'not declared'],
    ['Studio attach', manifest.studioAttachEnabled ? 'enabled' : 'disabled'],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }
}

function renderPublicAshaReadout(readout) {
  const statusLabel = document.querySelector('#runtime-session-status');
  const facts = document.querySelector('#public-asha-summary');
  const snapshot = document.querySelector('#static-room-snapshot');
  facts.replaceChildren();
  snapshot.replaceChildren();

  if (readout === undefined || readout === null) {
    statusLabel.textContent = 'Unavailable';
    appendFact(facts, 'Status', 'Unavailable');
    return;
  }

  statusLabel.textContent = `${readout.runtimeSession.mode} · loop-ready`;
  const rows = [
    ['Public imports', readout.publicImports.join(', ')],
    ['RuntimeSession', readout.runtimeSession.sessionId],
    ['Session hash', readout.runtimeSession.sessionHash],
    ['Projection hash', readout.runtimeSession.projectionHash],
    ['Static room fixture', readout.staticRoom.fixtureName],
    ['Render ops', String(readout.staticRoom.renderOpCount)],
    ['Projected handles', String(readout.staticRoom.projectionHandleCount)],
    ['Renderer handles', String(readout.staticRoom.rendererHandleCount)],
    ['Wall instances', String(readout.staticRoom.wallInstanceCount)],
    ['Movement proof', readout.movementReadout.collision.collided ? 'wall stop available' : 'not blocked'],
    ['Snapshot hash', readout.staticRoom.structuralSnapshotHash],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }

  for (const line of readout.staticRoom.structuralSnapshotPreview) {
    const item = document.createElement('li');
    item.textContent = line;
    snapshot.append(item);
  }
}

function renderMovementReadout(readout) {
  const facts = document.querySelector('#movement-summary');
  const keys = document.querySelector('#movement-keys');
  const collision = readout.latestCollision;
  facts.replaceChildren();
  keys.replaceChildren();

  const rows = [
    ['Tick', String(readout.tick)],
    ['Position', formatVector(readout.pose.position)],
    ['Yaw / pitch', `${readout.pose.yawDegrees.toFixed(1)} / ${readout.pose.pitchDegrees.toFixed(1)}`],
    ['Move input', `${readout.input.moveForward} forward, ${readout.input.moveRight} right`],
    ['Mouse delta', formatVector(readout.input.pendingMouseDelta)],
    ['Pointer fallback', readout.input.pointerLocked ? 'active' : 'inactive'],
    ['Collision', collision?.collided ? `blocked ${collision.blockedAxes.join(', ')}` : 'clear'],
    ['Movement hash', collision?.movementHash ?? 'not stepped'],
    ['Collision hash', collision?.collisionProjectionHash ?? 'not stepped'],
    ['Error', readout.latestError ?? 'none'],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }

  const pressedKeys = readout.input.pressedKeys.length === 0 ? ['none'] : readout.input.pressedKeys;
  for (const key of pressedKeys) {
    const item = document.createElement('li');
    item.textContent = key;
    keys.append(item);
  }
}

function renderGeneratedTunnelReadout(generatedTunnel) {
  const facts = document.querySelector('#generated-tunnel-summary');
  const markers = document.querySelector('#generated-tunnel-markers');
  facts.replaceChildren();
  markers.replaceChildren();

  if (generatedTunnel === undefined || generatedTunnel === null) {
    appendFact(facts, 'Status', 'Unavailable');
    return;
  }

  const readout = generatedTunnel.readout;
  const rows = [
    ['Preset path', generatedTunnel.presetPath],
    ['Preset id', readout.generator.presetId],
    ['Seed', String(readout.generator.seed)],
    ['Generator', readout.generator.generatorId],
    ['Config hash', readout.generator.configHash],
    ['Output hash', readout.generator.outputHash],
    ['Replay hash', readout.replayHash],
    ['Tunnel dims', formatVector(readout.volume.tunnelDims)],
    ['Solid voxels', String(readout.volume.solidVoxels)],
    ['Corridors / rooms', `${readout.corridors.count} / ${readout.rooms.count}`],
    ['Render projection', readout.renderProjection.hash],
    ['Collision projection', readout.collisionProjection.hash],
    ['Materials', readout.materials.map((material) => `${material.role}:${material.material}`).join(', ')],
    ['Regenerate', `${generatedTunnel.regenerate.status} · ${generatedTunnel.regenerate.reason}`],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }

  for (const marker of readout.spawnMarkers) {
    const item = document.createElement('li');
    item.textContent = `${marker.id} ${marker.kind} voxel ${formatVector(marker.voxel)} world ${formatVector(marker.world)}`;
    markers.append(item);
  }
}

function renderCombatHudReadout(combatHud) {
  const facts = document.querySelector('#combat-summary');
  const events = document.querySelector('#combat-events');
  facts.replaceChildren();
  events.replaceChildren();

  if (combatHud === undefined || combatHud === null) {
    appendFact(facts, 'Status', 'Unavailable');
    return;
  }

  const outcome = combatHud.combatReadout.outcome;
  const health = combatHud.hudProjection.health;
  const rows = [
    ['Target descriptor', combatHud.staticTargetPath],
    ['Target entity', String(health.entity)],
    ['Fire status', combatHud.fireReceipt.status],
    ['Outcome', outcome.kind],
    ['Distance', outcome.kind === 'hit' ? String(outcome.distance) : 'none'],
    ['Health', combatHud.hudProjection.health.label],
    ['Health ratio', combatHud.hudProjection.health.ratio.toFixed(2)],
    ['Health hash', combatHud.combatReadout.healthHash],
    ['Replay hash', combatHud.combatReadout.replayHash],
    ['Restart intent', combatHud.menuIntents.restart.kind],
    ['Options intent', combatHud.menuIntents.options.kind],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }

  for (const event of combatHud.combatReadout.events) {
    const item = document.createElement('li');
    item.textContent = event.kind;
    events.append(item);
  }
}

function renderCombatActionReceipt(actionReceipt) {
  const facts = document.querySelector('#combat-action-summary');
  facts.replaceChildren();
  if (actionReceipt === null) {
    appendFact(facts, 'Action', 'not fired');
    appendFact(facts, 'Lifecycle', 'waiting for public RuntimeSession intent');
    return;
  }
  const combatReadout = actionReceipt.receipt.combatReadout;
  const health = combatReadout?.health[0];
  const rows = [
    ['Tick', String(actionReceipt.tick)],
    ['Intent', actionReceipt.receipt.envelope.action],
    ['Status', actionReceipt.receipt.status],
    ['Accepted', actionReceipt.receipt.accepted ? 'yes' : 'no'],
    ['Outcome', combatReadout?.outcome.kind ?? 'none'],
    ['Health', health === undefined ? 'none' : `Health ${health.current}/${health.max}${health.dead ? ' defeated' : ''}`],
    ['Payload', 'payload' in actionReceipt.receipt ? 'present' : 'none'],
  ];
  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }
}

function renderEnemyPolicyReadout(readout) {
  const facts = document.querySelector('#enemy-policy-summary');
  const proposals = document.querySelector('#enemy-policy-proposals');
  const diagnostics = document.querySelector('#enemy-policy-diagnostics');
  facts.replaceChildren();
  proposals.replaceChildren();
  diagnostics.replaceChildren();

  const autonomousTick = readout.autonomousTick;
  const proposalFrame = autonomousTick?.policy.proposalFrame ?? null;
  const movementSummary = autonomousTick?.movementSummary ?? null;
  const combatSummary = autonomousTick?.combatSummary ?? null;
  const combatReceipt = autonomousTick?.proposalReceipts.find((receipt) => receipt.actionReceipt !== null) ?? null;
  const health = combatReceipt?.actionReceipt?.combatReadout?.health[0];
  const forbiddenTokens = readout.sourceGuard.forbiddenDiagnostics.map((diagnostic) => diagnostic.token).join(', ');
  const rows = [
    ['Policy source', readout.policySourcePath],
    ['Public imports', readout.publicImports.join(', ')],
    ['Tick', String(readout.tick)],
    ['Autonomous tick', autonomousTick === null ? 'not run' : autonomousTick.kind],
    ['Policy view', autonomousTick === null ? 'waiting' : `${autonomousTick.policy.fixtureKind} · read-only proposal-only`],
    ['Nav path hash', autonomousTick?.nav.pathHash ?? 'not run'],
    [
      'Proposals',
      autonomousTick === null
        ? 'not run'
        : `${autonomousTick.proposalSummary.acceptedProposalCount} accepted, ${autonomousTick.proposalSummary.unsupportedProposalCount} unsupported, ${autonomousTick.proposalSummary.rejectedProposalCount} rejected`,
    ],
    [
      'Move proposal',
      movementSummary === null
        ? 'not run'
        : `${movementSummary.status} -> ${movementSummary.nextWaypoint === null ? 'none' : formatVector(movementSummary.nextWaypoint)}`,
    ],
    ['Move reason', movementSummary?.reason ?? 'not run'],
    ['Fire status', combatSummary?.status ?? 'not submitted'],
    ['Health', health === undefined ? 'not submitted' : `Health ${health.current}/${health.max}${health.dead ? ' defeated' : ''}`],
    ['Proposal hash', proposalFrame?.proposalHash ?? 'not run'],
    ['Forbidden guard', forbiddenTokens],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }

  for (const proposal of proposalFrame?.proposals ?? []) {
    const item = document.createElement('li');
    item.textContent =
      proposal.kind === 'enemy_policy.move_toward_target.v0'
        ? `${proposal.kind} -> ${proposal.nextWaypoint === null ? 'none' : formatVector(proposal.nextWaypoint)}`
        : `${proposal.kind} -> ${proposal.intent.action} ${proposal.intent.source}`;
    proposals.append(item);
  }
  if (proposalFrame === null) {
    const item = document.createElement('li');
    item.textContent = 'Run Enemy Tick to submit public autonomous policy proposals.';
    proposals.append(item);
  }

  const diagnosticLines =
    (proposalFrame?.diagnostics.length ?? 0) === 0
      ? ['none']
      : proposalFrame.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.detail}`);
  for (const diagnostic of diagnosticLines) {
    const item = document.createElement('li');
    item.textContent = diagnostic;
    diagnostics.append(item);
  }
}

function appendFact(facts, label, value) {
  const term = document.createElement('dt');
  term.textContent = label;
  const detail = document.createElement('dd');
  detail.textContent = value;
  facts.append(term, detail);
}

function renderList(container, values) {
  container.replaceChildren();
  for (const value of values) {
    const item = document.createElement('li');
    item.textContent = value;
    container.append(item);
  }
}

function projectHudHealth(health) {
  const ratio = health.max === 0 ? 0 : health.current / health.max;
  return {
    entity: health.entity,
    current: health.current,
    max: health.max,
    dead: health.dead,
    ratio,
    label: `Health ${health.current}/${health.max}${health.dead ? ' defeated' : ''}`,
  };
}

function fallbackHudControls() {
  return [
    { id: 'hud-resume', role: 'button', label: 'Resume', value: 'resume', disabled: false },
    { id: 'hud-restart', role: 'button', label: 'Restart session', value: 'restart' },
    { id: 'hud-options', role: 'button', label: 'Options', value: 'options' },
    { id: 'hud-exit', role: 'button', label: 'Exit', value: 'exit' },
  ];
}

function fallbackHudIntents() {
  return {
    resume: { kind: 'ui.resume_intent', source: 'hud_menu' },
    restart: { kind: 'runtime.restart_session_intent', source: 'hud_menu' },
    options: { kind: 'ui.open_options_intent', source: 'hud_menu' },
    exit: { kind: 'ui.exit_to_menu_intent', source: 'hud_menu' },
  };
}

function formatVector(values) {
  return values.map((value) => Number(value).toFixed(2)).join(', ');
}
