import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { installAshaDemoStandaloneProvider } from '../host/standalone-bootstrap.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'dist/ui');
const replayRoot = join(repoRoot, 'replays');
const replayPath = join(replayRoot, 'generated-tunnel-playable-loop.json');

const installation = installAshaDemoStandaloneProvider(globalThis);
const content = await loadContent();
const contentStatus = await readContentStatus(content);
if (!contentStatus.valid) {
  throw new Error(`Replay capture rejected invalid project content: ${contentStatus.diagnostics.join('; ')}`);
}

const runtimeBackend = await createRuntimeBackend(content);
if (!runtimeBackend.available || runtimeBackend.status !== 'rust_authority') {
  const diagnostic = runtimeBackend.diagnostics?.[0]?.message ?? runtimeBackend.status;
  throw new Error(`Replay capture requires native RuntimeSession authority: ${diagnostic}`);
}
if (runtimeBackend.generatedTunnelOperation?.status !== 'applied') {
  throw new Error('Replay capture requires an applied generated-tunnel collision operation.');
}

const runtimeGateway = await createRuntimeGateway(runtimeBackend);
let camera = createCamera(runtimeGateway, content);
const movement = runtimeGateway.applyCollisionConstrainedCameraInput({
  camera: camera.handle ?? camera.camera,
  grid: runtimeBackend.generatedTunnelOperation.grid,
  movementMode: 'grounded',
  input: {
    moveForward: 1,
    moveRight: 0,
    moveUp: 0,
    yawDeltaDegrees: 0,
    pitchDeltaDegrees: 0,
    dtSeconds: 0.25,
    moveSpeedUnitsPerSecond: 3,
  },
  tick: 1,
  shape: content.runtime.collisionShape,
  policy: content.runtime.collisionPolicy,
});

const enemyLoop = driveEnemyToPlayerDeath(runtimeGateway, camera);
const lifecycleBeforeRestart = runtimeGateway.readLifecycleStatus();
if (!lifecycleBeforeRestart?.player?.dead) {
  throw new Error('Replay capture expected the generated-tunnel enemy loop to defeat the player.');
}

const restart = runtimeGateway.requestSessionRestart({
  kind: 'runtime.restart_session_intent',
  source: 'hud_menu',
  requireTerminal: true,
  expectedSessionHash: lifecycleBeforeRestart.sessionHash,
});
if (!restart?.accepted) {
  throw new Error('Replay capture expected RuntimeSession restart to be accepted.');
}

camera = createCamera(runtimeGateway, content);
const primaryFire = runtimeGateway.submitPrimaryFire({
  phase: 'pressed',
  camera,
  tick: 0,
  source: 'replay_evidence_capture',
  pressed: true,
  baseDamage: content.catalogs.weapon.damage,
  rangeMillimeters: content.catalogs.weapon.rangeUnits * 1000,
});
if (!primaryFire?.accepted || primaryFire.combatReadout?.outcome?.kind !== 'hit') {
  throw new Error('Replay capture expected primary fire to defeat the generated-tunnel enemy.');
}

const lifecycleAfterFire = runtimeGateway.readLifecycleStatus();
const telemetry = runtimeGateway.readTelemetry();
const telemetryHashes = (telemetry?.replayRecords ?? []).map((record) => (
  record.replayHash ?? record.recordHash ?? null
)).filter((hash) => hash !== null);
const artifact = {
  kind: 'asha_demo.runtime_replay_evidence.v1',
  classification: {
    demoOwnedEvidence: true,
    runtimeAuthority: 'public_runtime_session_telemetry',
    nonAuthority: ['not_demo_local_replay_authority', 'not_save_load_persistence'],
  },
  projectBundle: {
    gameId: content.projectBundle.project.gameId,
    sceneId: content.projectBundle.runtimeRequest.sceneId,
    seed: content.runtime.seed,
  },
  runtime: {
    backendStatus: runtimeBackend.status,
    providerContract: installation.profile.providerContract,
    referenceFallback: installation.profile.referenceFallback,
    generatedTunnelOperation: {
      status: runtimeBackend.generatedTunnelOperation.status,
      presetId: runtimeBackend.generatedTunnelOperation.presetId,
      seed: runtimeBackend.generatedTunnelOperation.seed,
      grid: runtimeBackend.generatedTunnelOperation.grid,
      outputHash: runtimeBackend.generatedTunnelOperation.outputHash,
      collisionSourceHash: runtimeBackend.generatedTunnelOperation.collisionSourceHash,
      collisionProjectionHash: runtimeBackend.generatedTunnelOperation.collisionProjectionHash,
    },
  },
  keyEvents: [
    {
      kind: 'movement',
      collisionConstrained: true,
      collided: movement.collided,
      blockedAxes: movement.blockedAxes,
      grid: movement.envelope.grid,
      movementMode: movement.envelope.movementMode,
      collisionSourceHash: movement.collisionSourceHash,
      collisionProjectionHash: movement.collisionProjectionHash,
      movementHash: movement.movementHash,
    },
    {
      kind: 'enemy_attack_and_player_death',
      tick: enemyLoop.tick,
      combatStatus: enemyLoop.readout?.combatSummary?.status ?? null,
      playerDead: lifecycleBeforeRestart.player.dead,
      lifecycleHash: lifecycleBeforeRestart.hashes?.lifecycleHash ?? null,
    },
    {
      kind: 'restart',
      accepted: restart.accepted,
      sessionHashAfter: restart.sessionHashAfter ?? null,
    },
    {
      kind: 'primary_fire_and_enemy_death',
      accepted: primaryFire.accepted,
      outcome: primaryFire.combatReadout.outcome.kind,
      replayHash: primaryFire.replayEvidence?.replayHash ?? null,
      enemyDead: lifecycleAfterFire?.enemy?.dead ?? null,
    },
  ],
  replay: {
    telemetryRecordCount: telemetry?.replayRecords?.length ?? 0,
    telemetryHashes: {
      first: telemetryHashes[0] ?? null,
      last: telemetryHashes.at(-1) ?? null,
      uniqueCount: new Set(telemetryHashes).size,
    },
    primaryFireReplayHash: primaryFire.replayEvidence?.replayHash ?? null,
  },
};

validateArtifact(artifact);
mkdirSync(replayRoot, { recursive: true });
writeFileSync(replayPath, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ replayPath, ...artifact.replay }, null, 2));

function driveEnemyToPlayerDeath(runtimeGateway, camera) {
  for (let tick = 0; tick < 40; tick += 1) {
    const readout = runtimeGateway.readPlayableEncounterTick({
      targetCamera: camera.handle ?? camera.camera,
      targetPosition: camera.pose.position,
      tick,
      shell: { paused: false },
    });
    const lifecycle = runtimeGateway.readLifecycleStatus();
    if (lifecycle?.player?.dead) {
      return { tick, readout };
    }
  }
  throw new Error('Replay capture exhausted enemy-loop ticks before player death.');
}

function createCamera(runtimeGateway, content) {
  const receipt = runtimeGateway.createCamera({
    initialPose: content.runtime.initialCameraPose,
    projection: content.runtime.cameraProjection,
    viewport: { width: 1280, height: 720 },
  });
  if (receipt?.snapshot === undefined) {
    throw new Error('Replay capture could not create a RuntimeSession camera.');
  }
  return receipt.snapshot;
}

function validateArtifact(artifact) {
  if (artifact.runtime.backendStatus !== 'rust_authority') {
    throw new Error('Replay artifact must record rust_authority.');
  }
  if (artifact.replay.primaryFireReplayHash === null || artifact.replay.telemetryRecordCount === 0) {
    throw new Error('Replay artifact must include public replay hashes and telemetry records.');
  }
  const kinds = artifact.keyEvents.map((event) => event.kind);
  for (const expected of ['movement', 'enemy_attack_and_player_death', 'restart', 'primary_fire_and_enemy_death']) {
    if (!kinds.includes(expected)) {
      throw new Error(`Replay artifact is missing ${expected}.`);
    }
  }
}

async function loadContent() {
  const module = await import(pathToFileURL(join(appRoot, 'content/project-content.js')));
  return module.loadDemoProjectContent(readStandaloneJson);
}

async function readContentStatus(content) {
  const module = await import(pathToFileURL(join(appRoot, 'content/project-content.js')));
  return module.readDemoProjectContentStatus(content);
}

async function createRuntimeBackend(content) {
  const module = await import(pathToFileURL(join(appRoot, 'runtime/demo-runtime-gateway.js')));
  return module.createDemoRuntimeBackend(content);
}

async function createRuntimeGateway(runtimeBackend) {
  const module = await import(pathToFileURL(join(appRoot, 'runtime/demo-runtime-gateway.js')));
  return module.createDemoRuntimeGateway(runtimeBackend);
}

async function readStandaloneJson(requestPath) {
  const normalized = requestPath.replace(/^\/+/, '');
  const filePath = resolve(appRoot, normalized);
  if (!filePath.startsWith(appRoot)) {
    throw new Error(`Replay capture rejected content path outside app root: ${requestPath}`);
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}
