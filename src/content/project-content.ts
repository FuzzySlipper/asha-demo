import {
  type FpsEcrpObjectModelReadout,
  type FpsEcrpRuntimeRole,
  type FpsGameplayPresetCatalogReadout,
  findFpsEcrpObjectModelEntry,
  readFpsEcrpObjectModel,
  readFpsGameplayPresetCatalog,
} from '@asha/catalog-core';
import {
  type CameraCollisionPolicy,
  type FlatSceneDocument,
  type GeneratedWireValue,
  type SceneBootstrapBindings,
  validateGeneratedWireValue,
} from '@asha/contracts';
import {
  decodeAndValidateAshaPrefabRegistrySourceDocument,
} from '@asha/game-workspace';
import type { AshaRendererAnimatedMeshResourceManifest } from '@asha/renderer-host';
import type {
  RuntimeSessionEcrpEntityDefinition,
  RuntimeSessionEcrpProjectCapabilityDefinition,
} from '@asha/runtime-session';
import {
  buildDemoPrefabAuthoring,
  type DemoPrefabAuthoring,
} from './prefab-authoring.js';
import {
  decodeDemoAnimatedMeshManifest,
  decodeDemoEntityDefinition,
  decodeDemoGameplayCatalog,
  decodeDemoLevelPreset,
  decodeDemoMaterialCatalog,
  decodeDemoProjectBundle,
  decodeDemoSpawnCatalog,
  decodeDemoWeaponCatalog,
  type DemoGameplayCatalog,
  type DemoLevelPreset,
  type DemoMaterialCatalog,
  type DemoProjectBundle,
  type DemoSpawnCatalog,
  type DemoWeaponCatalog,
} from './project-source.js';

const PROJECT_BUNDLE_PATH = '/project/project-bundle.json';
const DEMO_PREFAB_ENTITY_DEFINITION_IDS = [
  'demo.console.body',
  'demo.console.body.blue',
  'demo.console.body.red',
  'demo.console.sensor',
] as const;

type DemoJsonReader = (path: string) => Promise<unknown>;
type DemoTextReader = (path: string) => Promise<string>;
type TransformCapability = Extract<
  RuntimeSessionEcrpProjectCapabilityDefinition,
  { readonly kind: 'transform' }
>;
type CollisionCapability = Extract<
  RuntimeSessionEcrpProjectCapabilityDefinition,
  { readonly kind: 'collisionBody' }
>;

export interface DemoProjectContent {
  readonly kind: 'asha_demo.ecrp_project_content.v1';
  readonly sourceFiles: {
    readonly projectBundle: typeof PROJECT_BUNDLE_PATH;
    readonly entityDefinitions: readonly string[];
    readonly sceneDocument: string;
    readonly catalogs: DemoProjectBundle['sourceFiles']['catalogRefs'];
    readonly prefabRegistry: string;
    readonly levelPreset: string;
    readonly animatedMeshManifest: string;
  };
  readonly projectBundle: DemoProjectBundle;
  readonly prefabAuthoring: DemoPrefabAuthoring;
  readonly entityDefinitions: readonly RuntimeSessionEcrpEntityDefinition[];
  readonly sceneDocument: FlatSceneDocument;
  readonly sceneDocumentSourceText: string;
  readonly catalogs: {
    readonly gameplay: DemoGameplayCatalog;
    readonly materials: DemoMaterialCatalog;
    readonly spawns: DemoSpawnCatalog;
    readonly weapon: DemoWeaponCatalog;
    readonly levelPreset: DemoLevelPreset;
    readonly animatedMeshManifest: AshaRendererAnimatedMeshResourceManifest;
    readonly upstreamGameplay: FpsGameplayPresetCatalogReadout;
    readonly upstreamEcrpObjectModel: FpsEcrpObjectModelReadout;
  };
  readonly runtime: {
    readonly sessionId: string;
    readonly seed: number;
    readonly initialCameraPose: TransformCapability['initial'];
    readonly collisionShape: {
      readonly halfExtents: CollisionCapability['halfExtents'];
    };
    readonly collisionPolicy: CameraCollisionPolicy;
    readonly cameraProjection: DemoProjectBundle['runtime']['cameraProjection'];
    readonly enemyRenderTarget: {
      readonly label: string;
      readonly position: TransformCapability['initial']['position'];
      readonly scale: readonly [number, number, number];
    };
  };
}

export interface DemoProjectContentStatus {
  readonly kind: 'asha_demo.project_content_status.v1';
  readonly valid: boolean;
  readonly diagnostics: readonly string[];
  readonly projectBundleId: string;
  readonly entityDefinitionCount: number;
  readonly sceneId: number;
  readonly sourceFiles: DemoProjectContent['sourceFiles'];
  readonly gameplayPresetHash: string;
  readonly ecrpObjectModelHash: string;
}

export async function loadDemoProjectContent(
  fetchJson: DemoJsonReader = readJson,
  fetchText?: DemoTextReader,
): Promise<DemoProjectContent> {
  const projectBundle = decodeDemoProjectBundle(await fetchJson(PROJECT_BUNDLE_PATH));
  const sourceFiles = projectBundle.sourceFiles;
  const catalogRefs = sourceFiles.catalogRefs;

  const [
    entityDefinitionDocuments,
    sceneDocumentSourceText,
    gameplayCatalogSource,
    materialCatalogSource,
    spawnCatalogSource,
    weaponCatalogSource,
    levelPresetSource,
    animatedMeshManifestSource,
    prefabRegistrySource,
  ] = await Promise.all([
    Promise.all(sourceFiles.entityDefinitions.map((path) => fetchJson(`/${path}`))),
    readSceneDocumentSourceText(`/${sourceFiles.sceneDocument}`, fetchJson, fetchText),
    fetchJson(`/${catalogRefs.gameplay}`),
    fetchJson(`/${catalogRefs.materials}`),
    fetchJson(`/${catalogRefs.spawns}`),
    fetchJson(`/${catalogRefs.weapon}`),
    fetchJson(`/${sourceFiles.levelPreset}`),
    fetchJson(`/${sourceFiles.animatedMeshManifest}`),
    fetchJson(`/${sourceFiles.prefabRegistry}`),
  ]);

  const entityDefinitions = entityDefinitionDocuments.map((document, index) =>
    decodeDemoEntityDefinition(document, `entityDefinitions[${index}]`),
  );
  const sceneDocument = validateSceneDocumentWireShape(sceneDocumentSourceText);
  const gameplayCatalog = decodeDemoGameplayCatalog(gameplayCatalogSource);
  const materialCatalog = decodeDemoMaterialCatalog(materialCatalogSource);
  const spawnCatalog = decodeDemoSpawnCatalog(spawnCatalogSource);
  const weaponCatalog = decodeDemoWeaponCatalog(weaponCatalogSource);
  const levelPreset = decodeDemoLevelPreset(levelPresetSource);
  const animatedMeshManifest = decodeDemoAnimatedMeshManifest(animatedMeshManifestSource);
  const prefabRegistryResult = decodeAndValidateAshaPrefabRegistrySourceDocument(
    prefabRegistrySource,
    {
      assetIds: [],
      entityDefinitionIds: DEMO_PREFAB_ENTITY_DEFINITION_IDS,
    },
  );
  if (!prefabRegistryResult.ok) {
    throw new Error(
      `Demo prefab registry failed public source validation: ${formatPrefabDiagnostics(prefabRegistryResult.diagnostics)}`,
    );
  }
  const prefabAuthoring = buildDemoPrefabAuthoring(
    prefabRegistryResult.registry,
    projectBundle.gameplayModuleBindings,
  );

  const playerDefinition = requireEntityDefinition(entityDefinitions, 'actor/demo-player');
  const enemyDefinition = requireEntityDefinition(entityDefinitions, 'actor/generated-tunnel-enemy');
  const playerTransform = requireCapability(playerDefinition, 'transform');
  const playerCollision = requireCapability(playerDefinition, 'collisionBody');
  const enemyTransform = requireCapability(enemyDefinition, 'transform');
  const enemyCollision = requireCapability(enemyDefinition, 'collisionBody');

  return {
    kind: 'asha_demo.ecrp_project_content.v1',
    sourceFiles: {
      projectBundle: PROJECT_BUNDLE_PATH,
      entityDefinitions: sourceFiles.entityDefinitions,
      sceneDocument: sourceFiles.sceneDocument,
      catalogs: catalogRefs,
      prefabRegistry: sourceFiles.prefabRegistry,
      levelPreset: sourceFiles.levelPreset,
      animatedMeshManifest: sourceFiles.animatedMeshManifest,
    },
    projectBundle,
    prefabAuthoring,
    entityDefinitions,
    sceneDocument,
    sceneDocumentSourceText,
    catalogs: {
      gameplay: gameplayCatalog,
      materials: materialCatalog,
      spawns: spawnCatalog,
      weapon: weaponCatalog,
      levelPreset,
      animatedMeshManifest,
      upstreamGameplay: readFpsGameplayPresetCatalog(),
      upstreamEcrpObjectModel: readFpsEcrpObjectModel(),
    },
    runtime: {
      sessionId: projectBundle.runtime.sessionId,
      seed: projectBundle.runtime.seed,
      initialCameraPose: playerTransform.initial,
      collisionShape: { halfExtents: playerCollision.halfExtents },
      collisionPolicy: requireCameraCollisionPolicy(playerCollision.policy),
      cameraProjection: projectBundle.runtime.cameraProjection,
      enemyRenderTarget: {
        label: enemyDefinition.stableId,
        position: enemyTransform.initial.position,
        scale: [
          enemyCollision.halfExtents[0] * 2,
          enemyCollision.halfExtents[1] * 2,
          enemyCollision.halfExtents[2] * 2,
        ],
      },
    },
  };
}

export function readDemoProjectContentStatus(
  demoProjectContent: DemoProjectContent,
): DemoProjectContentStatus {
  const diagnostics: string[] = [];
  validateProjectBundle(demoProjectContent, diagnostics);
  validateEntitiesAgainstObjectModel(demoProjectContent, diagnostics);
  validateAuthoredRefs(demoProjectContent, diagnostics);

  return {
    kind: 'asha_demo.project_content_status.v1',
    valid: diagnostics.length === 0,
    diagnostics,
    projectBundleId: demoProjectContent.projectBundle.project.gameId,
    entityDefinitionCount: demoProjectContent.entityDefinitions.length,
    sceneId: demoProjectContent.sceneDocument.id,
    sourceFiles: demoProjectContent.sourceFiles,
    gameplayPresetHash: demoProjectContent.catalogs.upstreamGameplay.defaultPreset.hashes.presetHash,
    ecrpObjectModelHash: demoProjectContent.catalogs.upstreamEcrpObjectModel.hashes.modelHash,
  };
}

async function readJson(path: string): Promise<unknown> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ASHA demo project file ${path}: ${response.status}`);
  }
  const document: unknown = await response.json();
  return document;
}

async function readText(path: string): Promise<string> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ASHA demo project file ${path}: ${response.status}`);
  }
  return response.text();
}

async function readSceneDocumentSourceText(
  path: string,
  fetchJson: DemoJsonReader,
  fetchText: DemoTextReader | undefined,
): Promise<string> {
  if (fetchText !== undefined) {
    return fetchText(path);
  }
  if (fetchJson === readJson) {
    return readText(path);
  }
  // Injected readers used by bounded checks may only expose decoded JSON. The
  // production browser and standalone host both provide literal source text.
  return `${JSON.stringify(await fetchJson(path), null, 2)}\n`;
}

function validateSceneDocumentWireShape(sourceText: string): FlatSceneDocument {
  let value: unknown;
  try {
    value = JSON.parse(sourceText) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`SceneDocument source is not JSON: ${message}`);
  }
  if (!isGeneratedWireValue(value)) {
    throw new Error('SceneDocument source must contain canonical JSON data');
  }
  const validation = validateGeneratedWireValue('scene.FlatSceneDocument', value, '$');
  if (validation.valid === false) {
    throw new Error(`${validation.issue.path}: ${validation.issue.message}`);
  }
  return value as unknown as FlatSceneDocument;
}

function isGeneratedWireValue(value: unknown): value is GeneratedWireValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isGeneratedWireValue);
  }
  return typeof value === 'object' && Object.values(value).every(isGeneratedWireValue);
}

function validateProjectBundle(content: DemoProjectContent, diagnostics: string[]): void {
  const { projectBundle } = content;
  if (projectBundle.project.gameId !== 'asha-demo') {
    diagnostics.push('ProjectBundle project.gameId must be asha-demo');
  }
  if (projectBundle.runtimeRequest.sceneId !== 4103) {
    diagnostics.push('ProjectBundle runtimeRequest.sceneId must be 4103');
  }
  if (projectBundle.sourceFiles.entityDefinitions.length === 0) {
    diagnostics.push('ProjectBundle sourceFiles.entityDefinitions must name durable entity files');
  }
  if (content.prefabAuthoring.readout.instances.length !== 2) {
    diagnostics.push('public prefab authoring must produce the authored and player placement instances');
  }
  if (
    content.prefabAuthoring.readout.selected?.roles
      .some((role) => role.role === 'interaction/sensor') !== true
  ) {
    diagnostics.push('public prefab authoring must expose the stable interaction/sensor part role');
  }
  if (projectBundle.gameplayModuleBindings.bindings.length !== 2) {
    diagnostics.push('ProjectBundle gameplayModuleBindings must declare the Session and prefab-part challenge bindings');
  }
  if (projectBundle.gameplayModuleBindings.overrides.length !== 2) {
    diagnostics.push('ProjectBundle gameplayModuleBindings must declare two prefab-instance configuration overrides');
  }
  if (projectBundle.gameplayTriggers.length !== 1) {
    diagnostics.push('ProjectBundle gameplayTriggers must declare the generated-tunnel challenge boundary');
  }
}

function validateEntitiesAgainstObjectModel(content: DemoProjectContent, diagnostics: string[]): void {
  const entityDefinitionIds = new Set(content.entityDefinitions.map((definition) => definition.stableId));
  const requiredRoles: readonly FpsEcrpRuntimeRole[] = ['player', 'enemy'];
  for (const role of requiredRoles) {
    const entry = findFpsEcrpObjectModelEntry(role);
    if (!entityDefinitionIds.has(entry.entityDefinitionId)) {
      diagnostics.push(`missing EntityDefinition for ${entry.entityDefinitionId}`);
      continue;
    }
    const definition = requireEntityDefinition(content.entityDefinitions, entry.entityDefinitionId);
    if (definition.source.relativePath !== entry.sourcePath) {
      diagnostics.push(`${entry.entityDefinitionId} source.relativePath must be ${entry.sourcePath}`);
    }
    if (definition.displayName !== entry.displayName) {
      diagnostics.push(`${entry.entityDefinitionId} displayName must be ${entry.displayName}`);
    }
    const capabilityKinds = new Set(definition.capabilities.map((capability) => capability.kind));
    for (const capabilityKind of entry.capabilityKinds) {
      if (!capabilityKinds.has(capabilityKind)) {
        diagnostics.push(`${entry.entityDefinitionId} missing ${capabilityKind} capability`);
      }
    }
  }
}

function validateAuthoredRefs(content: DemoProjectContent, diagnostics: string[]): void {
  const { catalogs, projectBundle, sceneDocument } = content;
  const upstreamPreset = catalogs.upstreamGameplay.defaultPreset.preset;
  const upstreamHashes = catalogs.upstreamGameplay.defaultPreset.hashes;

  if (projectBundle.catalogs.gameplayCatalogId !== catalogs.upstreamGameplay.catalog.catalogId) {
    diagnostics.push('ProjectBundle gameplayCatalogId does not match upstream gameplay catalog');
  }
  if (projectBundle.catalogs.objectModelId !== catalogs.upstreamEcrpObjectModel.model.modelId) {
    diagnostics.push('ProjectBundle objectModelId does not match upstream ECRP object model');
  }
  if (catalogs.gameplay.defaultPresetId !== upstreamPreset.presetId) {
    diagnostics.push('gameplay catalog defaultPresetId does not match upstream preset');
  }
  if (catalogs.gameplay.defaultPresetHash !== upstreamHashes.presetHash) {
    diagnostics.push('gameplay catalog defaultPresetHash does not match upstream preset hash');
  }
  if (catalogs.gameplay.tuningHash !== upstreamHashes.tuningHash) {
    diagnostics.push('gameplay catalog tuningHash does not match upstream tuning hash');
  }
  if (!deepEqual(catalogs.weapon, { kind: catalogs.weapon.kind, ...upstreamPreset.weapon })) {
    diagnostics.push('weapon catalog tuning does not match upstream gameplay preset weapon tuning');
  }
  if (!deepEqual(levelPresetWithoutSource(catalogs.levelPreset), upstreamPreset.generator)) {
    diagnostics.push('level preset ref does not match upstream gameplay preset generator ref');
  }
  if (sceneDocument.id !== projectBundle.runtimeRequest.sceneId) {
    diagnostics.push('SceneDocument id does not match ProjectBundle runtime sceneId');
  }

  const bootstrapBindings = readSceneBootstrapBindings(sceneDocument);
  if (bootstrapBindings === null) {
    diagnostics.push('SceneDocument must declare one canonical bootstrap node');
  } else {
    validateSceneGeneratorBinding(bootstrapBindings, catalogs.levelPreset, diagnostics);
    validateSceneCatalogBindings(content, bootstrapBindings, diagnostics);
  }

  const spawnMarkerIds = new Set(catalogs.spawns.markers.map((marker) => marker.markerId));
  const placedDefinitions = new Set<string>();
  for (const node of sceneDocument.nodes) {
    if (node.kind.kind !== 'entityInstance' || node.kind.instance.reference.kind !== 'entityDefinition') {
      continue;
    }
    placedDefinitions.add(node.kind.instance.reference.stableId);
    const marker = node.kind.instance.spawnMarkerId;
    if (marker !== null && !spawnMarkerIds.has(marker)) {
      diagnostics.push(`SceneDocument entity instance references missing spawn marker ${marker}`);
    }
  }
  for (const stableId of ['actor/demo-player', 'actor/generated-tunnel-enemy']) {
    if (!placedDefinitions.has(stableId)) {
      diagnostics.push(`SceneDocument is missing entity instance ${stableId}`);
    }
  }
  if (catalogs.materials.materials.length === 0) {
    diagnostics.push('material catalog must contain at least one material role');
  }
  if (catalogs.animatedMeshManifest.resources.length !== 1) {
    diagnostics.push('animated mesh manifest must declare exactly one public renderer-host resource');
  }
}

export function readSceneBootstrapBindings(
  sceneDocument: FlatSceneDocument,
): SceneBootstrapBindings | null {
  const node = sceneDocument.nodes.find((candidate) => candidate.kind.kind === 'bootstrap');
  return node?.kind.kind === 'bootstrap' ? node.kind.bindings : null;
}

function validateSceneGeneratorBinding(
  bindings: SceneBootstrapBindings,
  levelPreset: DemoLevelPreset,
  diagnostics: string[],
): void {
  const generator = bindings.generator;
  if (generator === null) {
    diagnostics.push('SceneDocument bootstrap must bind the generated-tunnel provider');
    return;
  }
  if (generator.providerId !== 'asha.generated-tunnel') {
    diagnostics.push('SceneDocument generator providerId must be asha.generated-tunnel');
  }
  if (generator.presetId !== levelPreset.presetId || generator.seed !== levelPreset.seed) {
    diagnostics.push('SceneDocument generator binding does not match the selected level preset');
  }
}

function validateSceneCatalogBindings(
  content: DemoProjectContent,
  bindings: SceneBootstrapBindings,
  diagnostics: string[],
): void {
  const expected = [
    ['gameplay', content.catalogs.gameplay.catalogId, content.sourceFiles.catalogs.gameplay],
    ['materials', content.catalogs.materials.catalogId, content.sourceFiles.catalogs.materials],
    ['spawns', content.catalogs.spawns.catalogId, content.sourceFiles.catalogs.spawns],
    ['weapon', content.catalogs.weapon.weaponId, content.sourceFiles.catalogs.weapon],
  ] as const;
  const byBindingId = new Map(bindings.catalogs.map((binding) => [binding.bindingId, binding]));
  for (const [bindingId, catalogId, sourcePath] of expected) {
    const binding = byBindingId.get(bindingId);
    if (binding === undefined) {
      diagnostics.push(`SceneDocument bootstrap is missing ${bindingId} catalog binding`);
      continue;
    }
    if (binding.catalogId !== catalogId || binding.sourcePath !== sourcePath) {
      diagnostics.push(`SceneDocument ${bindingId} catalog binding does not match ProjectBundle content`);
    }
  }
}

function requireEntityDefinition(
  entityDefinitions: readonly RuntimeSessionEcrpEntityDefinition[],
  stableId: string,
): RuntimeSessionEcrpEntityDefinition {
  const definition = entityDefinitions.find((candidate) => candidate.stableId === stableId);
  if (definition === undefined) {
    throw new Error(`ASHA demo project content is missing ${stableId}`);
  }
  return definition;
}

function requireCapability<K extends RuntimeSessionEcrpProjectCapabilityDefinition['kind']>(
  entityDefinition: RuntimeSessionEcrpEntityDefinition,
  kind: K,
): Extract<RuntimeSessionEcrpProjectCapabilityDefinition, { readonly kind: K }> {
  const capability = entityDefinition.capabilities.find(
    (candidate): candidate is Extract<RuntimeSessionEcrpProjectCapabilityDefinition, { readonly kind: K }> =>
      candidate.kind === kind,
  );
  if (capability === undefined) {
    throw new Error(`${entityDefinition.stableId} is missing ${kind}`);
  }
  return capability;
}

function levelPresetWithoutSource(preset: DemoLevelPreset): Omit<DemoLevelPreset, 'kind' | 'sceneDocument'> {
  return {
    presetId: preset.presetId,
    seed: preset.seed,
    outputHash: preset.outputHash,
    renderProjectionHash: preset.renderProjectionHash,
    collisionProjectionHash: preset.collisionProjectionHash,
  };
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatPrefabDiagnostics(
  diagnostics: readonly { readonly code: string; readonly path: string }[],
): string {
  return diagnostics.map((diagnostic) => `${diagnostic.code}:${diagnostic.path}`).join(', ');
}

function requireCameraCollisionPolicy(value: object | undefined): CameraCollisionPolicy {
  if (value === undefined || Array.isArray(value)) {
    throw new Error('Demo player collisionBody.policy must be an object');
  }
  const policy = value as Readonly<Record<string, unknown>>;
  if (policy['mode'] !== 'axis_separable_slide') {
    throw new Error('Demo player collisionBody.policy.mode must be axis_separable_slide');
  }
  const maxIterations = policy['maxIterations'];
  if (typeof maxIterations !== 'number' || !Number.isSafeInteger(maxIterations) || maxIterations <= 0) {
    throw new Error('Demo player collisionBody.policy.maxIterations must be a positive safe integer');
  }
  return { mode: 'axis_separable_slide', maxIterations };
}
