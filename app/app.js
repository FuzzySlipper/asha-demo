import {
  BrowserFpsInputCollector,
  RuntimeBridgeError,
  createGeneratedTunnelEnemyPolicyFixture,
  createMockRuntimeSession,
  validateEnemyPolicySource,
} from '@asha/runtime-bridge';

const fallbackStatus = {
  manifest: { present: false },
  allowedImports: [],
  sourceRoots: [],
  nonClaims: ['This is not yet a playable FPS.'],
};

const response = await fetch('/api/status', { headers: { Accept: 'application/json' } }).catch(() => null);
const status = response?.ok ? await response.json() : fallbackStatus;
const movementDemo = createMovementDemo();

renderManifest(status.manifest);
renderPublicAshaReadout(status.publicAshaReadout);
renderGeneratedTunnelReadout(status.publicAshaReadout?.generatedTunnel);
renderMovementReadout(movementDemo.readout());
renderCombatHudReadout(status.publicAshaReadout?.combatHud);
renderEnemyPolicyReadout(movementDemo.enemyPolicyReadout());
wireMovementControls(movementDemo);
renderList(document.querySelector('#allowed-imports'), status.allowedImports);
renderList(document.querySelector('#source-roots'), status.sourceRoots);
renderList(document.querySelector('#non-claims'), status.nonClaims);

function createMovementDemo() {
  const session = createMockRuntimeSession();
  const initialized = session.initialize({
    sessionId: 'asha-demo:browser-static-room:movement',
    seed: 4037,
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
  const cameraReceipt = createStaticRoomCamera();
  const input = new BrowserFpsInputCollector({
    camera: cameraReceipt.snapshot.camera,
    moveSpeedUnitsPerSecond: 3,
    mouseSensitivityDegreesPerPixel: 0.1,
    pointerLocked: false,
  });
  let tick = 0;
  let latestCamera = cameraReceipt.snapshot;
  let latestFrame = null;
  let latestCollision = null;
  let latestError = null;
  let latestEnemyPolicy = null;
  let loop = null;

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
      latestCamera = createStaticRoomCamera().snapshot;
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
      return {
        tick,
        receipt,
      };
    },
    runEnemyPolicy() {
      tick += 1;
      const fixture = createEnemyPolicyFixture(tick);
      const fireProposal = fixture.frame.proposals.find(
        (proposal) => proposal.kind === 'enemy_policy.primary_fire_intent.v0',
      );
      const fireReceipt = fireProposal === undefined ? null : session.submitRuntimeActionIntent(fireProposal.intent);
      latestEnemyPolicy = {
        tick,
        fixture,
        fireReceipt,
      };
      return this.enemyPolicyReadout();
    },
    enemyPolicyReadout() {
      const policy = latestEnemyPolicy ?? {
        tick,
        fixture: createEnemyPolicyFixture(tick),
        fireReceipt: null,
      };
      return {
        statusVersion: 'asha-demo-enemy-policy.v0',
        publicImports: ['@asha/runtime-bridge'],
        policySourcePath: 'policies/README.md',
        tick: policy.tick,
        view: {
          enemy: policy.fixture.view.enemy,
          target: {
            id: policy.fixture.view.target.id,
            position: policy.fixture.view.target.position,
          },
          navPathHash: policy.fixture.view.nav.latestPath.pathHash,
          readOnly: policy.fixture.view.readOnly,
          proposalOnly: policy.fixture.view.proposalOnly,
        },
        frame: policy.fixture.frame,
        fireReceipt: policy.fireReceipt,
        sourceGuard: {
          cleanDiagnostics: validateEnemyPolicySource('export const policy = (view) => [];'),
          forbiddenDiagnostics: validateEnemyPolicySource('Date.now(); Math.random(); fetch("/state"); window.location.href;'),
        },
        nonClaims: policy.fixture.nonClaims,
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

  function createEnemyPolicyFixture(policyTick) {
    return createGeneratedTunnelEnemyPolicyFixture({
      tick: policyTick,
      nav: session.readNavPolicyView(),
      target: {
        camera: latestCamera.camera,
        position: [1, 1, 1],
      },
    });
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
    } catch (error) {
      latestError =
        error instanceof RuntimeBridgeError
          ? `${error.kind}: ${error.message}`
          : error instanceof Error
            ? error.message
            : String(error);
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
        renderMovementReadout(movementDemo.readout());
        return;
      }
      movementDemo.step();
      renderMovementReadout(movementDemo.readout());
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
  const actionButtons = document.querySelectorAll('[data-movement-action]');

  pointerButton.addEventListener('click', () => {
    renderMovementReadout(demo.activatePointerFallback());
    surface.focus();
  });
  releaseButton.addEventListener('click', () => renderMovementReadout(demo.deactivatePointerFallback()));
  stepButton.addEventListener('click', () => renderMovementReadout(demo.step()));
  wallButton.addEventListener('click', () => renderMovementReadout(demo.probeWallStop()));
  fireButton.addEventListener('click', () => renderCombatActionReceipt(demo.firePrimary()));
  enemyPolicyButton.addEventListener('click', () => renderEnemyPolicyReadout(demo.runEnemyPolicy()));

  for (const button of actionButtons) {
    button.addEventListener('click', () => {
      const action = button.dataset.movementAction;
      if (action === 'forward') {
        renderMovementReadout(demo.nudge('KeyW'));
      } else if (action === 'back') {
        renderMovementReadout(demo.nudge('KeyS'));
      } else if (action === 'left') {
        renderMovementReadout(demo.nudge('KeyA'));
      } else if (action === 'right') {
        renderMovementReadout(demo.nudge('KeyD'));
      } else if (action === 'look-left') {
        renderMovementReadout(demo.look(-18, 0));
      } else if (action === 'look-right') {
        renderMovementReadout(demo.look(18, 0));
      } else if (action === 'look-up') {
        renderMovementReadout(demo.look(0, -12));
      } else if (action === 'look-down') {
        renderMovementReadout(demo.look(0, 12));
      }
    });
  }

  surface.addEventListener('keydown', (event) => {
    renderMovementReadout(demo.keyDown(event));
  });
  surface.addEventListener('keyup', (event) => {
    renderMovementReadout(demo.keyUp(event));
  });
  surface.addEventListener('mousemove', (event) => {
    renderMovementReadout(demo.mouseMove(event));
  });
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

  statusLabel.textContent = `${readout.runtimeSession.mode} · movement-ready`;
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

  const fireProposal = readout.frame.proposals.find(
    (proposal) => proposal.kind === 'enemy_policy.primary_fire_intent.v0',
  );
  const moveProposal = readout.frame.proposals.find(
    (proposal) => proposal.kind === 'enemy_policy.move_toward_target.v0',
  );
  const combatReadout = readout.fireReceipt?.combatReadout;
  const health = combatReadout?.health[0];
  const forbiddenTokens = readout.sourceGuard.forbiddenDiagnostics.map((diagnostic) => diagnostic.token).join(', ');
  const rows = [
    ['Policy source', readout.policySourcePath],
    ['Public imports', readout.publicImports.join(', ')],
    ['Tick', String(readout.tick)],
    ['Enemy', `${readout.view.enemy.id} at ${formatVector(readout.view.enemy.position)}`],
    ['Target', `${readout.view.target.id} at ${formatVector(readout.view.target.position)}`],
    ['Policy view', readout.view.readOnly && readout.view.proposalOnly ? 'read-only proposal-only' : 'invalid'],
    ['Nav path hash', readout.view.navPathHash],
    ['Move proposal', moveProposal?.nextWaypoint === null ? 'none' : formatVector(moveProposal?.nextWaypoint ?? [])],
    ['Fire source', fireProposal?.intent.source ?? 'none'],
    ['Proposal hash', readout.frame.proposalHash],
    ['Fire status', readout.fireReceipt?.status ?? 'not submitted'],
    ['Health', health === undefined ? 'not submitted' : `Health ${health.current}/${health.max}${health.dead ? ' defeated' : ''}`],
    ['Forbidden guard', forbiddenTokens],
  ];

  for (const [label, value] of rows) {
    appendFact(facts, label, value);
  }

  for (const proposal of readout.frame.proposals) {
    const item = document.createElement('li');
    item.textContent =
      proposal.kind === 'enemy_policy.move_toward_target.v0'
        ? `${proposal.kind} -> ${proposal.nextWaypoint === null ? 'none' : formatVector(proposal.nextWaypoint)}`
        : `${proposal.kind} -> ${proposal.intent.action} ${proposal.intent.source}`;
    proposals.append(item);
  }

  const diagnosticLines =
    readout.frame.diagnostics.length === 0
      ? ['none']
      : readout.frame.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.detail}`);
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

function formatVector(values) {
  return values.map((value) => Number(value).toFixed(2)).join(', ');
}
