import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { installAshaDemoStandaloneProvider } from '../host/standalone-bootstrap.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'dist/ui');
const shouldBuild = !process.argv.includes('--no-build');

if (shouldBuild) runBuild();

const installation = installAshaDemoStandaloneProvider(globalThis);
const content = await loadContent();
const status = await readContentStatus(content);
if (!status.valid) {
  throw new Error(`Standalone host packaged invalid project content: ${status.diagnostics.join('; ')}`);
}

const storedSourcesBeforePlay = hashManifestClosure(content.projectManifest);
const runtimeBackend = await createRuntimeBackend(content);
if (!runtimeBackend.available || runtimeBackend.status !== 'rust_authority') {
  const diagnostic = runtimeBackend.diagnostics?.[0]?.message ?? runtimeBackend.status;
  throw new Error(`Standalone host failed before native RuntimeSession authority loaded: ${diagnostic}`);
}
if (!runtimeBackend.loadReceipt.accepted || runtimeBackend.loadReceipt.activeProject === null) {
  throw new Error('Standalone host did not receive a canonical active-project identity.');
}
if (runtimeBackend.loadReceipt.activeProject.projectId !== content.projectManifest.project.id) {
  throw new Error('Standalone host activated a project other than the manifest-selected Demo project.');
}
if (runtimeBackend.sceneDocument.id !== content.projectManifest.entryScene) {
  throw new Error('Standalone host entry scene did not come from the canonical project load.');
}
if (runtimeBackend.storedEnvironment?.status !== 'loaded') {
  throw new Error('Standalone host did not activate the stored voxel environment.');
}
await assertInvalidPlayerBoundsRejectBeforePublication(content, 'missing-bounds', capabilities => (
  capabilities.filter(capability => capability.kind !== 'bounds')
));
await assertInvalidPlayerBoundsRejectBeforePublication(content, 'zero-width-bounds', capabilities => (
  capabilities.map(capability => capability.kind === 'bounds'
    ? { ...capability, max: [capability.min[0], capability.max[1], capability.max[2]] }
    : capability)
));

const runtimeGateway = await createRuntimeGateway(runtimeBackend);
const readout = runtimeGateway.readEcrpRuntimeReadout();
if (readout?.entityCount !== 3 || runtimeBackend.loadReceipt.activeProject.entityCount !== 7) {
  throw new Error(
    `Standalone host expected seven active entities and three FPS role entities, saw ${runtimeBackend.loadReceipt.activeProject.entityCount}/${readout?.entityCount ?? 'none'}`,
  );
}
assertStoredSceneRuntimeTransforms(readout, runtimeBackend.sceneDocument);
if (JSON.stringify(runtimeBackend.launchSettings.collisionShape.halfExtents) !== JSON.stringify([0.25, 0.7, 0.25])) {
  throw new Error(
    `Standalone host collision envelope did not derive from Demo Player bounds: ${JSON.stringify(runtimeBackend.launchSettings.collisionShape.halfExtents)}`,
  );
}

const playerPose = readRuntimeTransform(
  readout,
  runtimeBackend.launchSettings.playerEntityDefinition,
  'launch player',
);

const cameraReceipt = runtimeGateway.createCamera({
  initialPose: {
    position: playerPose.position,
    yawDegrees: playerPose.yawDegrees,
    pitchDegrees: playerPose.pitchDegrees,
  },
  projection: runtimeBackend.launchSettings.cameraProjection,
  viewport: { width: 1280, height: 720 },
});
if (cameraReceipt?.snapshot === undefined) {
  throw new Error('Standalone host could not create an authoritative RuntimeSession camera.');
}
assertPosition(
  cameraReceipt.snapshot.pose.position,
  playerPose.position,
  'launch camera',
);
if (
  cameraReceipt.snapshot.projection.fovYDegrees
  !== runtimeBackend.launchSettings.cameraProjection.fovYDegrees
) {
  throw new Error('Standalone host camera did not retain the Rust-admitted launch projection.');
}

const fireReceipt = runtimeGateway.submitPrimaryFire({
  phase: 'pressed',
  camera: cameraReceipt.snapshot,
  tick: 0,
  source: 'programmatic',
  pressed: true,
});
if (!fireReceipt?.accepted) {
  throw new Error('Standalone host native RuntimeSession rejected primary fire smoke.');
}
const gameplayReadout = runtimeGateway.readGameplayRuntime();
const challengeState = runtimeGateway.readGameplayChallengeState();
if (gameplayReadout?.reactionFrameCount < 1 || gameplayReadout?.decisionReceiptCount < 1) {
  throw new Error('Standalone host did not retain the linked gameplay module reaction frame.');
}
if (challengeState?.revision < 1) {
  throw new Error('Standalone host did not retain the typed challenge-view readback.');
}

const storedSourcesAfterPlay = hashManifestClosure(content.projectManifest);
if (storedSourcesAfterPlay !== storedSourcesBeforePlay) {
  throw new Error('Normal runtime play mutated the canonical project source closure.');
}

console.log(JSON.stringify({
  kind: 'asha_demo.standalone_host_smoke.v2',
  hostMode: 'standalone_compiled',
  contentRoot: 'dist/ui',
  providerGlobal: installation.providerGlobal,
  providerContract: installation.profile.providerContract,
  referenceFallback: installation.profile.referenceFallback,
  projectManifest: status.projectManifest,
  projectId: runtimeBackend.loadReceipt.activeProject.projectId,
  admissionHash: runtimeBackend.loadReceipt.activeProject.admissionHash,
  entityCount: readout.entityCount,
  storedVoxelAsset: runtimeBackend.storedEnvironment.assetId,
  gameplayModule: fireReceipt.gameplayTransform?.moduleId ?? null,
  runtimeStatus: runtimeBackend.status,
  primaryFireAccepted: fireReceipt.accepted,
  gameplayReactionFrameCount: gameplayReadout.reactionFrameCount,
  challengeRevision: challengeState.revision,
  launchFovYDegrees: cameraReceipt.snapshot.projection.fovYDegrees,
  collisionHalfExtents: runtimeBackend.launchSettings.collisionShape.halfExtents,
  playerStartPosition: cameraReceipt.snapshot.pose.position,
  storedSourcesUnchanged: true,
}, null, 2));

function runBuild() {
  const result = spawnSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function loadContent() {
  const module = await import(pathToFileURL(join(appRoot, 'content/project-content.js')));
  return module.loadDemoProjectContent(readStandaloneJson, readStandaloneBytes);
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
  return JSON.parse(new TextDecoder().decode(await readStandaloneBytes(requestPath)));
}

async function readStandaloneBytes(requestPath) {
  const normalized = requestPath.replace(/^\/+/, '');
  const filePath = resolve(appRoot, normalized);
  if (!filePath.startsWith(`${appRoot}/`) && filePath !== appRoot) {
    throw new Error(`Standalone host rejected content path outside app root: ${requestPath}`);
  }
  return new Uint8Array(readFileSync(filePath));
}

function hashManifestClosure(manifest) {
  const hash = createHash('sha256');
  hash.update(readFileSync(join(repoRoot, 'asha.project-bundle.json')));
  for (const artifact of manifest.artifacts) {
    hash.update(artifact.path);
    hash.update(readFileSync(join(repoRoot, artifact.path)));
  }
  return hash.digest('hex');
}

async function assertInvalidPlayerBoundsRejectBeforePublication(content, label, mutateCapabilities) {
  const manifestPath = 'asha.project-bundle.json';
  const playerPath = 'catalogs/actors/demo-player.entity.json';
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const manifest = JSON.parse(decoder.decode(await content.projectSource.read(manifestPath)));
  const playerDocument = JSON.parse(decoder.decode(await content.projectSource.read(playerPath)));
  playerDocument.document.capabilities = mutateCapabilities(playerDocument.document.capabilities);
  const playerBytes = encoder.encode(JSON.stringify(playerDocument));
  const playerArtifact = manifest.artifacts.find(artifact => artifact.path === playerPath);
  if (playerArtifact === undefined) {
    throw new Error('Standalone host could not find the player EntityDefinition artifact.');
  }
  playerArtifact.contentHash = fnv1a64(playerBytes);
  const manifestBytes = encoder.encode(JSON.stringify(manifest));
  const rejected = await createRuntimeBackend({
    ...content,
    projectSource: {
      kind: 'development-directory',
      identity: `development-directory:asha-demo-invalid-${label}`,
      read: async relativePath => {
        if (relativePath === manifestPath) return manifestBytes;
        if (relativePath === playerPath) return playerBytes;
        return content.projectSource.read(relativePath);
      },
    },
    runtime: {
      ...content.runtime,
      sessionId: `${content.runtime.sessionId}.${label}`,
    },
  });
  if (
    rejected.available
    || rejected.loadReceipt.accepted
    || rejected.loadReceipt.activeProject !== null
  ) {
    throw new Error(
      `Standalone host published invalid ${label} player bounds: ${JSON.stringify(rejected.loadReceipt)}`,
    );
  }
  const diagnostics = JSON.stringify(rejected.loadReceipt.diagnostics);
  if (!diagnostics.includes('playerEntityDefinition')) {
    throw new Error(`Invalid ${label} rejection lost player field context: ${diagnostics}`);
  }
}

function fnv1a64(bytes) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function assertStoredSceneRuntimeTransforms(readout, sceneDocument) {
  const player = readout.entities.find((entity) => entity.definitionStableId === 'actor/demo-player');
  const enemy = readout.entities.find(
    (entity) => entity.definitionStableId === 'actor/generated-tunnel-enemy',
  );
  assertRuntimeTransform(
    player,
    readStoredSpawnPosition(sceneDocument, 'actor/demo-player'),
    'player',
  );
  assertRuntimeTransform(
    enemy,
    readStoredSpawnPosition(sceneDocument, 'actor/generated-tunnel-enemy'),
    'enemy',
  );
}

function readStoredSpawnPosition(sceneDocument, definitionStableId) {
  const instanceNode = sceneDocument.nodes.find((node) => (
    node.kind?.kind === 'entityInstance'
    && node.kind.instance.reference?.kind === 'entityDefinition'
    && node.kind.instance.reference.stableId === definitionStableId
  ));
  if (instanceNode === undefined) {
    throw new Error(`Standalone host could not find stored ${definitionStableId} scene instance.`);
  }
  const spawnMarkerId = instanceNode.kind.instance.spawnMarkerId;
  if (spawnMarkerId === null) return instanceNode.transform.translation;
  const marker = sceneDocument.nodes.find((node) => (
    node.kind?.kind === 'marker' && node.kind.markerId === spawnMarkerId
  ));
  if (marker === undefined) {
    throw new Error(`Standalone host could not resolve stored spawn marker ${spawnMarkerId}.`);
  }
  return marker.transform.translation;
}

function readRuntimeTransform(readout, definitionStableId, label) {
  const entity = readout.entities.find(
    (candidate) => candidate.definitionStableId === definitionStableId,
  );
  const transform = entity?.capabilities.find((capability) => capability.kind === 'transform');
  if (transform?.kind !== 'transform') {
    throw new Error(`Standalone host ${label} has no Rust-authoritative transform.`);
  }
  return transform;
}

function assertRuntimeTransform(entity, expectedPosition, label) {
  const transform = entity?.capabilities.find((capability) => capability.kind === 'transform');
  if (transform?.kind !== 'transform') {
    throw new Error(
      `Standalone host ${label} transform did not come from the stored scene: ${JSON.stringify(transform)}`,
    );
  }
  assertPosition(transform.position, expectedPosition, label);
}

function assertPosition(actual, expected, label) {
  const positionMatches = actual.every((component, index) => (
    Math.abs(component - expected[index]) <= 0.000_001
  ));
  if (!positionMatches) {
    throw new Error(
      `Standalone host ${label} position did not match stored/admitted state: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
    );
  }
}
