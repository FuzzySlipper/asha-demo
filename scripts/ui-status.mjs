import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createStaticRoomRenderFrame, renderProjectedFrame, STATIC_ROOM_FIXTURE_NAME } from '@asha/renderer-three';
import { createMockRuntimeSession } from '@asha/runtime-bridge';

export function buildUiStatus(repoRoot) {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  const manifestText = readFileSync(join(repoRoot, 'asha.game.toml'), 'utf8');
  const manifest = readTinyToml(manifestText);
  const publicAshaReadout = buildPublicAshaReadout();

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
      'No movement.',
      'No shooting.',
      'No enemy AI.',
      'No procedural dungeon.',
      'No death or restart loop.',
      'No gameplay controls or pointer lock.',
      'No interactive renderer or pixel-rendered gameplay claim.',
      'No collision, pathfinding, combat, enemy AI, or procedural generation.',
      'No Studio live inspection or control claim.',
    ],
  };
}

function buildPublicAshaReadout() {
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
  const frame = createStaticRoomRenderFrame();
  const rendered = renderProjectedFrame(frame);
  const structuralLines = rendered.structuralSnapshot.trim().split('\n');

  return {
    statusVersion: 'asha-demo-public-readout.v0',
    publicImports: ['@asha/runtime-bridge', '@asha/renderer-three'],
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
    nonClaims: [
      'static_readout_only',
      'not_native_runtime',
      'not_interactive_renderer',
      'not_gameplay_loop',
      'not_collision_or_motion_evidence',
    ],
  };
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
