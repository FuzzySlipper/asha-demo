import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createStaticRoomRenderFrame, renderProjectedFrame, STATIC_ROOM_FIXTURE_NAME } from '@asha/renderer-three';
import {
  createGeneratedTunnelEnemyPolicyFixture,
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
    kind: 'served static public ASHA readout UI',
    playable: false,
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
      'Not a playable FPS.',
      'No live native RuntimeSession attach.',
      'No autonomous enemy gameplay loop.',
      'No continuous combat loop.',
      'No live procedural dungeon gameplay.',
      'No death or restart loop.',
      'No interactive renderer or pixel-rendered gameplay claim.',
      'No local generation algorithm, pathfinding, combat authority, or enemy movement authority.',
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
  const enemyPolicyFixture = createGeneratedTunnelEnemyPolicyFixture({
    tick: 8,
    nav: session.readNavPolicyView(),
    target: {
      camera: fireCamera,
      position: [1, 1, 1],
    },
  });
  const enemyFireProposal = enemyPolicyFixture.frame.proposals.find(
    (proposal) => proposal.kind === 'enemy_policy.primary_fire_intent.v0',
  );
  const enemyFireReceipt =
    enemyFireProposal === undefined ? null : session.submitRuntimeActionIntent(enemyFireProposal.intent);
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
      status: 'public_enemy_policy_fixture',
      policySourcePath: 'policies/README.md',
      publicImports: ['@asha/runtime-bridge'],
      nonClaims: enemyPolicyFixture.nonClaims,
      view: {
        kind: enemyPolicyFixture.view.kind,
        tick: enemyPolicyFixture.view.tick,
        enemy: enemyPolicyFixture.view.enemy,
        target: {
          id: enemyPolicyFixture.view.target.id,
          position: enemyPolicyFixture.view.target.position,
        },
        navPathHash: enemyPolicyFixture.view.nav.latestPath.pathHash,
        readOnly: enemyPolicyFixture.view.readOnly,
        proposalOnly: enemyPolicyFixture.view.proposalOnly,
      },
      frame: {
        kind: enemyPolicyFixture.frame.kind,
        tick: enemyPolicyFixture.frame.tick,
        proposalHash: enemyPolicyFixture.frame.proposalHash,
        proposals: summarizeEnemyPolicyProposals(enemyPolicyFixture.frame.proposals),
        diagnostics: enemyPolicyFixture.frame.diagnostics,
      },
      fireReceipt: enemyFireReceipt === null ? null : {
        accepted: enemyFireReceipt.accepted,
        status: enemyFireReceipt.status,
        rejection: enemyFireReceipt.rejection,
        envelope: {
          action: enemyFireReceipt.envelope.action,
          phase: enemyFireReceipt.envelope.phase,
          source: enemyFireReceipt.envelope.source,
          tick: enemyFireReceipt.envelope.tick,
        },
        combatReadout: enemyFireReceipt.combatReadout,
      },
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
      'not_gameplay_loop',
      'not_autonomous_enemy_gameplay_loop',
      'not_continuous_combat_loop',
      'not_demo_local_combat_authority',
      'not_demo_local_enemy_movement_authority',
      'not_demo_local_generation_algorithm',
      'not_live_regenerate',
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
