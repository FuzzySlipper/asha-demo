import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createStaticRoomRenderFrame,
  renderFirstPersonTunnelViewport,
  renderProjectedFrame,
  STATIC_ROOM_FIXTURE_NAME,
} from '@asha/renderer-three';
import {
  createMockRuntimeSession,
  validateEnemyPolicySource,
} from '@asha/runtime-bridge';
import { buildHudProjection, hudControlToIntent } from '@asha/ui-dom';

export function buildUiStatus(repoRoot) {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const manifestText = readFileSync(join(repoRoot, 'asha.game.toml'), 'utf8');
  const manifest = readTinyToml(manifestText);
  const generatedTunnelPreset = JSON.parse(readFileSync(join(repoRoot, 'levels/presets/tiny-enclosed-tunnel.json'), 'utf8'));
  const staticTarget = JSON.parse(readFileSync(join(repoRoot, 'catalogs/actors/static-target-dummy.json'), 'utf8'));
  const publicAshaReadout = buildPublicAshaReadout(generatedTunnelPreset, staticTarget);

  return {
    repo: 'asha-demo',
    kind: 'served integrated public ASHA playable-loop UI',
    playable: true,
    runtimeSessionAttached: true,
    studioLiveIntegration: false,
    manifest: {
      present: true,
      engineSource: manifest.asha?.engine_source ?? null,
      runtimeCommand: manifest.runtime?.dev_command ?? null,
      studioAttachEnabled: manifest.studio?.attach_enabled === true,
    },
    publicAshaReadout,
    allowedImports: Object.keys(packageJson.dependencies ?? {}).filter((name) => name.startsWith('@asha/')).sort(),
    sourceRoots: [
      ...arrayValue(manifest.workspace?.scene_roots),
      ...arrayValue(manifest.workspace?.asset_roots),
      ...arrayValue(manifest.workspace?.replay_roots),
      ...arrayValue(manifest.workspace?.catalog_packages),
    ],
    nonClaims: [
      'No live native RuntimeSession attach.',
      'Reference RuntimeSession playable loop only; not a full native FPS.',
      'Enemy movement remains proposal-only: movement_authority_not_wired.',
      'Generated tunnel is a public deterministic readout, not a live applied dungeon runtime.',
      'No interactive renderer or pixel-rendered gameplay claim.',
      'No local generation algorithm, pathfinding, collision, combat, policy, or lifecycle authority.',
      'No Studio live inspection or control claim.',
    ],
  };
}

function buildPublicAshaReadout(generatedTunnelPreset, staticTarget) {
  const session = createMockRuntimeSession();
  const initialized = session.initialize({
    sessionId: 'asha-demo:static-room:reference-session',
    seed: 4034,
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
  const telemetry = session.readTelemetry();
  const runtimeProjection = session.readProjection();
  const camera = session.createCamera({
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
  }).snapshot.camera;
  const wallStop = session.applyCollisionConstrainedCameraInput({
    camera,
    grid: 1,
    input: {
      moveForward: 1,
      moveRight: 0,
      moveUp: 0,
      yawDeltaDegrees: 0,
      pitchDeltaDegrees: 0,
      dtSeconds: 1,
      moveSpeedUnitsPerSecond: 99,
    },
    tick: 1,
    shape: {
      halfExtents: [0.25, 0.25, 0.25],
    },
    policy: {
      mode: 'axis_separable_slide',
      maxIterations: 3,
    },
  });
  const generatedTunnel = session.readGeneratedTunnelReadout({
    presetId: generatedTunnelPreset.presetId,
    seed: generatedTunnelPreset.seed,
  });
  const generatedTunnelOperation = session.requestGeneratedTunnelOperation({
    operation: 'regenerate',
    presetId: generatedTunnelPreset.presetId,
    seed: generatedTunnelPreset.seed,
  });
  const fireCamera = session.createCamera({
    initialPose: {
      position: [2.5, 1.5, 1.5],
      yawDegrees: 180,
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
  }).snapshot.camera;
  const fireReceipt = session.submitRuntimeActionIntent({
    kind: 'runtime_action_intent.v0',
    action: 'primary_fire',
    phase: 'pressed',
    camera: fireCamera,
    tick: 7,
    source: 'programmatic',
    pressed: true,
  });
  const playableLoop = buildPlayableLoopReadout(generatedTunnelPreset);
  const combatReadout = fireReceipt.combatReadout;
  const hudProjection = buildHudProjection({
    health: combatReadout.health[0],
    status: [
      { id: 'combat', tone: combatReadout.outcome.kind === 'hit' ? 'danger' : 'info', text: combatReadout.outcome.kind },
    ],
    nonClaims: ['not_enemy_ai', 'not_combat_loop', 'not_demo_local_combat_authority'],
    menuOpen: true,
  });
  const frame = createStaticRoomRenderFrame();
  const rendered = renderProjectedFrame(frame);
  const structuralLines = rendered.structuralSnapshot.trim().split('\n');

  return {
    statusVersion: 'asha-demo-public-readout.v0',
    publicImports: ['@asha/runtime-bridge', '@asha/renderer-three', '@asha/ui-dom'],
    runtimeSession: {
      sessionId: initialized.identity.sessionId,
      mode: initialized.identity.mode,
      tick: telemetry.tick,
      sessionHash: telemetry.sessionHash,
      replayRecordCount: telemetry.replayRecords.length,
      acceptedCommandCount: telemetry.acceptedCommandCount,
      rejectedCommandCount: telemetry.rejectedCommandCount,
      projectionHash: runtimeProjection.projectionHash,
      nonClaims: initialized.identity.nonClaims,
    },
    staticRoom: {
      fixtureName: STATIC_ROOM_FIXTURE_NAME,
      renderOpCount: frame.ops.length,
      projectionHandleCount: rendered.projection.handleCount,
      rendererHandleCount: rendered.renderer.handleCount,
      wallInstanceCount: rendered.renderer.instanceCountFor('mesh/room-wall'),
      markerPresent: rendered.structuralSnapshot.includes('room-origin-marker'),
      structuralSnapshotPreview: structuralLines.slice(0, 4),
      structuralSnapshotHash: stableHash(rendered.structuralSnapshot),
    },
    movementReadout: {
      status: 'public_runtime_session_collision_probe',
      input: wallStop.envelope.input,
      before: wallStop.snapshot.before.pose,
      attempted: wallStop.snapshot.attempted.pose,
      after: wallStop.snapshot.after.pose,
      collision: {
        collided: wallStop.collided,
        blockedAxes: wallStop.blockedAxes,
        movementHash: wallStop.movementHash,
        collisionProjectionHash: wallStop.collisionProjectionHash,
      },
    },
    generatedTunnel: {
      presetPath: 'levels/presets/tiny-enclosed-tunnel.json',
      preset: generatedTunnelPreset,
      readout: generatedTunnel,
      regenerate: {
        operation: generatedTunnelOperation.operation,
        status: generatedTunnelOperation.status,
        reason: generatedTunnelOperation.reason,
      },
    },
    playableLoop,
    combatHud: {
      staticTargetPath: 'catalogs/actors/static-target-dummy.json',
      staticTarget,
      fireReceipt: {
        accepted: fireReceipt.accepted,
        status: fireReceipt.status,
        rejection: fireReceipt.rejection,
      },
      combatReadout,
      hudProjection,
      menuIntents: {
        restart: hudControlToIntent('hud-restart'),
        options: hudControlToIntent('hud-options'),
        exit: hudControlToIntent('hud-exit'),
      },
    },
    enemyPolicy: {
      status: 'public_autonomous_policy_tick',
      policySourcePath: 'policies/README.md',
      publicImports: ['@asha/runtime-bridge'],
      nonClaims: playableLoop.autonomousTick.nonClaims,
      tickReadout: playableLoop.autonomousTick,
      movementAuthority: playableLoop.autonomousTick.movementSummary,
      combatAuthority: playableLoop.autonomousTick.combatSummary,
      sourceValidation: {
        cleanDiagnostics: validateEnemyPolicySource('export const policy = (view) => [];'),
        forbiddenDiagnostics: validateEnemyPolicySource(
          'Date.now(); Math.random(); fetch("/state"); window.location.href; import("node:fs");',
        ),
      },
    },
    nonClaims: [
      'movement_readout_only',
      'not_native_runtime',
      'not_interactive_renderer',
      'reference_runtime_session_playable_loop_only',
      'movement_authority_not_wired',
      'not_demo_local_combat_authority',
      'not_demo_local_enemy_movement_authority',
      'not_demo_local_generation_algorithm',
      'not_live_regenerate',
    ],
  };
}

function buildPlayableLoopReadout(generatedTunnelPreset) {
  const session = createMockRuntimeSession();
  const initialized = session.initialize({
    sessionId: 'asha-demo:playable-loop:reference-session',
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
  const camera = session.createCamera({
    initialPose: {
      position: [2.5, 1.5, 1.5],
      yawDegrees: 180,
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
  }).snapshot.camera;
  const cameraProjection = session.readCameraProjection({
    camera,
    viewport: null,
  }).snapshot;
  const generatedTunnel = session.readGeneratedTunnelReadout({
    presetId: generatedTunnelPreset.presetId,
    seed: generatedTunnelPreset.seed,
  });
  const firstPersonViewport = renderFirstPersonTunnelViewport({
    tunnel: generatedTunnel,
    camera: cameraProjection,
    collision: null,
  });
  const initialLifecycle = session.readLifecycleStatus();
  const autonomousTick = session.runAutonomousPolicyTick({
    targetCamera: camera,
    policySource: 'export const policy = (view) => view;',
  });
  const lifecycleAfterAutonomousTick = session.readLifecycleStatus();
  const playerDefeatFixture = session.readLifecycleStatus({ scenario: 'generated_tunnel_player_defeated' });
  const restartReceipt = session.requestSessionRestart({
    kind: 'runtime.restart_session_intent',
    source: 'programmatic',
    requireTerminal: true,
    expectedSessionHash: lifecycleAfterAutonomousTick.sessionHash,
  });

  return {
    status: 'public_runtime_session_playable_loop',
    publicImports: ['@asha/runtime-bridge'],
    runtimeSession: {
      sessionId: initialized.identity.sessionId,
      mode: initialized.identity.mode,
      seed: initialized.identity.seed,
    },
    generatedTunnel: {
      presetId: generatedTunnel.generator.presetId,
      seed: generatedTunnel.generator.seed,
      outputHash: generatedTunnel.generator.outputHash,
      replayHash: generatedTunnel.replayHash,
      spawnMarkers: generatedTunnel.spawnMarkers,
    },
    firstPersonViewport: {
      status: 'rendered',
      publicImports: ['@asha/renderer-three', '@asha/runtime-bridge'],
      summary: firstPersonViewport.summary,
      projectionHandleCount: firstPersonViewport.projection.handleCount,
      rendererHandleCount: firstPersonViewport.renderer.handleCount,
      wallInstanceCount: firstPersonViewport.renderer.instanceCountFor('mesh/generated-tunnel-wall'),
      structuralSnapshotPreview: firstPersonViewport.structuralSnapshot.trim().split('\n').slice(0, 5),
    },
    initialLifecycle,
    autonomousTick: {
      ...autonomousTick,
      policy: {
        ...autonomousTick.policy,
        proposalFrame: {
          ...autonomousTick.policy.proposalFrame,
          proposals: summarizeEnemyPolicyProposals(autonomousTick.policy.proposalFrame.proposals),
        },
      },
    },
    lifecycleAfterAutonomousTick,
    playerDefeatFixture,
    restartReceipt,
    hudOverlay: buildHudOverlayProjection(lifecycleAfterAutonomousTick, restartReceipt),
    nonClaims: [
      'not_native_runtime',
      'movement_authority_not_wired',
      'not_demo_local_authority',
      'not_interactive_renderer',
    ],
  };
}

function buildHudOverlayProjection(lifecycleStatus, restartReceipt) {
  return {
    status: 'public_hud_projection_overlay',
    publicImports: ['@asha/ui-dom', '@asha/runtime-bridge'],
    projection: buildHudProjection({
      health: lifecycleStatus.enemy.health,
      status: [
        {
          id: 'lifecycle',
          tone: lifecycleStatus.outcome.terminal ? 'danger' : 'info',
          text: lifecycleStatus.outcome.label,
        },
        {
          id: 'restart',
          tone: restartReceipt.status === 'accepted' ? 'info' : 'warning',
          text: `Restart ${restartReceipt.status}`,
        },
        {
          id: 'enemy-movement',
          tone: 'warning',
          text: 'movement_authority_not_wired',
        },
      ],
      nonClaims: [
        'not_ui_authority',
        'not_options_or_exit_implementation',
        'not_native_runtime',
      ],
      menuOpen: true,
    }),
    playerHealth: lifecycleStatus.player.health,
    targetHealth: lifecycleStatus.enemy.health,
    lifecycle: lifecycleStatus,
    restartReceipt,
    menuIntents: {
      resume: hudControlToIntent('hud-resume'),
      restart: hudControlToIntent('hud-restart'),
      options: hudControlToIntent('hud-options'),
      exit: hudControlToIntent('hud-exit'),
    },
    unsupportedControls: [
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
}

function summarizeEnemyPolicyProposals(proposals) {
  return proposals.map((proposal) => {
    if (proposal.kind === 'enemy_policy.move_toward_target.v0') {
      return {
        kind: proposal.kind,
        actor: proposal.actor,
        target: proposal.target,
        nextWaypoint: proposal.nextWaypoint,
        pathHash: proposal.pathHash,
        authority: proposal.authority,
      };
    }
    return {
      kind: proposal.kind,
      actor: proposal.actor,
      target: proposal.target,
      intent: {
        action: proposal.intent.action,
        phase: proposal.intent.phase,
        source: proposal.intent.source,
        tick: proposal.intent.tick,
      },
      distanceUnits: proposal.distanceUnits,
      authority: proposal.authority,
    };
  });
}

function stableHash(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `asha-demo-static-room-${hash.toString(16).padStart(8, '0')}`;
}

function readTinyToml(text) {
  const document = {};
  let currentSection = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripComment(rawLine).trim();
    if (line.length === 0) {
      continue;
    }
    const section = /^\[([A-Za-z0-9_-]+)\]$/.exec(line);
    if (section) {
      currentSection = section[1];
      document[currentSection] ??= {};
      continue;
    }
    const assignment = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (assignment && currentSection !== null) {
      document[currentSection][assignment[1]] = parseTinyTomlValue(assignment[2].trim());
    }
  }

  return document;
}

function stripComment(line) {
  let inString = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index - 1] !== '\\') {
      inString = !inString;
    }
    if (char === '#' && !inString) {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseTinyTomlValue(rawValue) {
  if (rawValue === 'true') {
    return true;
  }
  if (rawValue === 'false') {
    return false;
  }
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return rawValue.slice(1, -1);
  }
  if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
    const inner = rawValue.slice(1, -1).trim();
    if (inner.length === 0) {
      return [];
    }
    return inner.split(',').map((part) => part.trim().slice(1, -1));
  }
  return rawValue;
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}
