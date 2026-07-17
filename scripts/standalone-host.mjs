import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { installAshaDemoStandaloneProvider } from '../host/standalone-bootstrap.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'dist/ui');
const shouldBuild = !process.argv.includes('--no-build');

if (shouldBuild) {
  runBuild();
}

const installation = installAshaDemoStandaloneProvider(globalThis);
const content = await loadContent();
const status = await readContentStatus(content);
const sceneSourcePath = join(appRoot, content.sourceFiles.sceneDocument);
const committedSceneSourceBeforeBoot = readFileSync(sceneSourcePath, 'utf8');

if (!status.valid) {
  throw new Error(`Standalone host packaged invalid project content: ${status.diagnostics.join('; ')}`);
}

const runtimeBackend = await createRuntimeBackend(content);
if (!runtimeBackend.available || runtimeBackend.status !== 'rust_authority') {
  const diagnostic = runtimeBackend.diagnostics?.[0]?.message ?? runtimeBackend.status;
  throw new Error(`Standalone host failed closed before native RuntimeSession authority loaded: ${diagnostic}`);
}

const runtimeGateway = await createRuntimeGateway(runtimeBackend);
const readout = runtimeGateway.readEcrpRuntimeReadout();
if (readout?.entityCount !== 2) {
  throw new Error(`Standalone host expected 2 ECRP entities, saw ${readout?.entityCount ?? 'none'}`);
}
if (content.sceneDocumentSourceText !== committedSceneSourceBeforeBoot) {
  throw new Error('Standalone host did not give Rust the exact committed SceneDocument source bytes.');
}
if (runtimeBackend.sceneDocumentContentHash === null) {
  throw new Error('Standalone host did not retain the Rust scene codec content identity.');
}
assertCanonicalSceneBootstrap(runtimeBackend, readout);
assertLegacySceneDiagnostic(runtimeBackend);
await assertStudioEditedTransformWinsOnFreshBoot(content, sceneSourcePath);

const cameraReceipt = runtimeGateway.createCamera({
  initialPose: content.runtime.initialCameraPose,
  projection: content.runtime.cameraProjection,
  viewport: { width: 1280, height: 720 },
});
if (cameraReceipt?.snapshot === undefined) {
  throw new Error('Standalone host could not create an authoritative RuntimeSession camera.');
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
if (gameplayReadout?.reactionFrameCount < 2 || gameplayReadout?.decisionReceiptCount < 1) {
  throw new Error('Standalone host did not retain the linked gameplay module reaction frame.');
}
if (
  runtimeBackend.prefabInteractionReceipt?.target
    !== content.projectBundle.gameplayRuntime.prefabInteraction.expectedTarget
  || challengeState?.revision < 1
) {
  throw new Error('Standalone host did not retain typed prefab interaction and named challenge-view readback.');
}

const summary = {
  kind: 'asha_demo.standalone_host_smoke.v1',
  hostMode: 'standalone_compiled',
  contentRoot: 'dist/ui',
  providerGlobal: installation.providerGlobal,
  providerContract: installation.profile.providerContract,
  referenceFallback: installation.profile.referenceFallback,
  projectBundle: status.sourceFiles.projectBundle,
  entityCount: readout.entityCount,
  sceneDocumentContentHash: runtimeBackend.sceneDocumentContentHash,
  gameplayModule: fireReceipt.gameplayTransform?.moduleId ?? null,
  runtimeStatus: runtimeBackend.status,
  primaryFireAccepted: fireReceipt.accepted,
  gameplayReactionFrameCount: gameplayReadout.reactionFrameCount,
  challengeRevision: challengeState.revision,
  prefabInteractionTarget: runtimeBackend.prefabInteractionReceipt.target,
};

console.log(JSON.stringify(summary, null, 2));

function runBuild() {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function loadContent() {
  const module = await import(pathToFileURL(join(appRoot, 'content/project-content.js')));
  return module.loadDemoProjectContent(readStandaloneJson, readStandaloneText);
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
  return JSON.parse(await readStandaloneText(requestPath));
}

async function readStandaloneText(requestPath) {
  const normalized = requestPath.replace(/^\/+/, '');
  const filePath = resolve(appRoot, normalized);
  if (!filePath.startsWith(appRoot)) {
    throw new Error(`Standalone host rejected content path outside app root: ${requestPath}`);
  }
  return readFileSync(filePath, 'utf8');
}

function assertCanonicalSceneBootstrap(runtimeBackend, readout) {
  const player = readout.entities.find((entity) => entity.definitionStableId === 'actor/demo-player');
  const enemy = readout.entities.find(
    (entity) => entity.definitionStableId === 'actor/generated-tunnel-enemy',
  );
  assertRuntimeTransform(player, [0, 1.62, 1.5], 'player');
  assertRuntimeTransform(enemy, [0, 0.5, -2.6], 'enemy');

  const instances = runtimeBackend.sceneDocument.nodes.filter(
    (node) => node.kind.kind === 'entityInstance',
  );
  const markers = instances.map((node) => node.kind.instance.spawnMarkerId).sort();
  if (JSON.stringify(markers) !== JSON.stringify(['spawn.enemy.primary', 'spawn.player.start'])) {
    throw new Error(`Canonical scene spawn bindings were not retained: ${JSON.stringify(markers)}`);
  }
}

function assertRuntimeTransform(entity, expectedPosition, label) {
  const transform = entity?.capabilities.find((capability) => capability.kind === 'transform');
  const positionMatches = transform?.kind === 'transform'
    && transform.position.every((component, index) =>
      Math.abs(component - expectedPosition[index]) <= 0.000_001);
  if (!positionMatches) {
    throw new Error(
      `Standalone host ${label} transform did not come from the canonical scene: ${JSON.stringify(transform)}`,
    );
  }
}

function assertLegacySceneDiagnostic(runtimeBackend) {
  const result = runtimeBackend.session.decodeSceneDocument({
    sourceText: JSON.stringify({
      kind: 'SceneDocument',
      sceneId: 'legacy-demo-scene',
      placements: [],
    }),
  });
  if (result.accepted || !result.diagnostics.some((diagnostic) => diagnostic.code === 'legacy-demo-scene')) {
    throw new Error('Rust scene codec did not classify the removed Demo scene shape as legacy-demo-scene.');
  }
}

async function assertStudioEditedTransformWinsOnFreshBoot(content, sceneSourcePath) {
  const editedScene = structuredClone(content.sceneDocument);
  const player = editedScene.nodes.find((node) =>
    node.kind.kind === 'entityInstance'
      && node.kind.instance.reference.kind === 'entityDefinition'
      && node.kind.instance.reference.stableId === 'actor/demo-player');
  if (player === undefined) {
    throw new Error('Canonical Demo scene is missing the player instance.');
  }
  player.transform.translation = [1.25, 1.62, 1.5];
  const editedContent = {
    ...content,
    sceneDocument: editedScene,
    sceneDocumentSourceText: `${JSON.stringify(editedScene, null, 2)}\n`,
    runtime: {
      ...content.runtime,
      sessionId: `${content.runtime.sessionId}.studio-edit-smoke`,
    },
  };
  const editedBackend = await createRuntimeBackend(editedContent);
  if (!editedBackend.available) {
    throw new Error(
      `Fresh RuntimeSession rejected the Studio-shaped transform edit: ${editedBackend.diagnostics[0]?.message ?? 'unknown error'}`,
    );
  }
  const editedGateway = await createRuntimeGateway(editedBackend);
  const editedReadout = editedGateway.readEcrpRuntimeReadout();
  const editedPlayer = editedReadout.entities.find(
    (entity) => entity.definitionStableId === 'actor/demo-player',
  );
  assertRuntimeTransform(editedPlayer, [1.25, 1.62, 1.5], 'Studio-edited player');
  if (readFileSync(sceneSourcePath, 'utf8') !== content.sceneDocumentSourceText) {
    throw new Error('Runtime play mutated the committed SceneDocument source file.');
  }
}
