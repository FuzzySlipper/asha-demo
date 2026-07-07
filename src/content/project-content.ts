import {
  type FpsEcrpRuntimeRole,
  findFpsEcrpObjectModelEntry,
  readFpsEcrpObjectModel,
  readFpsGameplayPresetCatalog,
} from '@asha/catalog-core';

const PROJECT_BUNDLE_PATH = '/project/project-bundle.json';

export async function loadDemoProjectContent(fetchJson = readJson) {
  const projectBundle = await fetchJson(PROJECT_BUNDLE_PATH);
  const sourceFiles = projectBundle.sourceFiles ?? {};
  const catalogRefs = sourceFiles.catalogRefs ?? {};

  const [
    entityDefinitions,
    sceneDocument,
    gameplayCatalog,
    materialCatalog,
    spawnCatalog,
    weaponCatalog,
    levelPreset,
  ] = await Promise.all([
    Promise.all((sourceFiles.entityDefinitions ?? []).map((path) => fetchJson(`/${path}`))),
    fetchJson(`/${sourceFiles.sceneDocument}`),
    fetchJson(`/${catalogRefs.gameplay}`),
    fetchJson(`/${catalogRefs.materials}`),
    fetchJson(`/${catalogRefs.spawns}`),
    fetchJson(`/${catalogRefs.weapon}`),
    fetchJson(`/${sourceFiles.levelPreset}`),
  ]);

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
      levelPreset: sourceFiles.levelPreset,
    },
    projectBundle,
    entityDefinitions,
    sceneDocument,
    catalogs: {
      gameplay: gameplayCatalog,
      materials: materialCatalog,
      spawns: spawnCatalog,
      weapon: weaponCatalog,
      levelPreset,
      upstreamGameplay: readFpsGameplayPresetCatalog(),
      upstreamEcrpObjectModel: readFpsEcrpObjectModel(),
    },
    runtime: {
      sessionId: projectBundle.runtime.sessionId,
      seed: projectBundle.runtime.seed,
      initialCameraPose: playerTransform.initial,
      collisionShape: {
        halfExtents: playerCollision.halfExtents,
      },
      collisionPolicy: playerCollision.policy,
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

export function readDemoProjectContentStatus(demoProjectContent) {
  const diagnostics = [];
  validateProjectBundle(demoProjectContent, diagnostics);
  validateEntitiesAgainstObjectModel(demoProjectContent, diagnostics);
  validateAuthoredRefs(demoProjectContent, diagnostics);

  return {
    kind: 'asha_demo.project_content_status.v1',
    valid: diagnostics.length === 0,
    diagnostics,
    projectBundleId: demoProjectContent.projectBundle.project?.gameId ?? null,
    entityDefinitionCount: demoProjectContent.entityDefinitions.length,
    sceneId: demoProjectContent.sceneDocument.sceneId,
    sourceFiles: demoProjectContent.sourceFiles,
    gameplayPresetHash: demoProjectContent.catalogs.upstreamGameplay.defaultPreset.hashes.presetHash,
    ecrpObjectModelHash: demoProjectContent.catalogs.upstreamEcrpObjectModel.hashes.modelHash,
  };
}

async function readJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ASHA demo project file ${path}: ${response.status}`);
  }
  return response.json();
}

function validateProjectBundle(demoProjectContent, diagnostics) {
  const { projectBundle } = demoProjectContent;
  if (projectBundle.kind !== 'ProjectBundle') {
    diagnostics.push('project/project-bundle.json kind must be ProjectBundle');
  }
  if (projectBundle.project?.gameId !== 'asha-demo') {
    diagnostics.push('ProjectBundle project.gameId must be asha-demo');
  }
  if (projectBundle.runtimeRequest?.sceneId !== 4103) {
    diagnostics.push('ProjectBundle runtimeRequest.sceneId must be 4103');
  }
  if (!Array.isArray(projectBundle.sourceFiles?.entityDefinitions) || projectBundle.sourceFiles.entityDefinitions.length === 0) {
    diagnostics.push('ProjectBundle sourceFiles.entityDefinitions must name durable entity files');
  }
}

function validateEntitiesAgainstObjectModel(demoProjectContent, diagnostics) {
  const entityDefinitionIds = new Set(
    demoProjectContent.entityDefinitions.map((definition) => definition.stableId),
  );

  const requiredRoles: readonly FpsEcrpRuntimeRole[] = ['player', 'enemy'];
  for (const role of requiredRoles) {
    const entry = findFpsEcrpObjectModelEntry(role);
    if (!entityDefinitionIds.has(entry.entityDefinitionId)) {
      diagnostics.push(`missing EntityDefinition for ${entry.entityDefinitionId}`);
      continue;
    }
    const definition = demoProjectContent.entityDefinitions.find(
      (candidate) => candidate.stableId === entry.entityDefinitionId,
    );
    if (definition.source?.relativePath !== entry.sourcePath) {
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

function validateAuthoredRefs(demoProjectContent, diagnostics) {
  const { catalogs, projectBundle, sceneDocument } = demoProjectContent;
  const upstreamPreset = catalogs.upstreamGameplay.defaultPreset.preset;
  const upstreamHashes = catalogs.upstreamGameplay.defaultPreset.hashes;

  if (projectBundle.catalogs?.gameplayCatalogId !== catalogs.upstreamGameplay.catalog.catalogId) {
    diagnostics.push('ProjectBundle gameplayCatalogId does not match upstream gameplay catalog');
  }
  if (projectBundle.catalogs?.objectModelId !== catalogs.upstreamEcrpObjectModel.model.modelId) {
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
  if (!deepEqual(stripKind(catalogs.levelPreset), upstreamPreset.generator)) {
    diagnostics.push('level preset ref does not match upstream gameplay preset generator ref');
  }
  if (sceneDocument.levelPresetRef !== upstreamPreset.generator.presetId) {
    diagnostics.push('SceneDocument levelPresetRef does not match level preset');
  }
  if (sceneDocument.generatedTunnelSeed !== upstreamPreset.generator.seed) {
    diagnostics.push('SceneDocument generatedTunnelSeed does not match level preset');
  }

  const spawnMarkerIds = new Set(catalogs.spawns.markers.map((marker) => marker.markerId));
  for (const placement of sceneDocument.placements ?? []) {
    if (!spawnMarkerIds.has(placement.spawnMarkerId)) {
      diagnostics.push(`SceneDocument placement references missing spawn marker ${placement.spawnMarkerId}`);
    }
  }
  if (!Array.isArray(catalogs.materials.materials) || catalogs.materials.materials.length === 0) {
    diagnostics.push('material catalog must contain at least one material role');
  }
}

function requireEntityDefinition(entityDefinitions, stableId) {
  const definition = entityDefinitions.find((candidate) => candidate.stableId === stableId);
  if (definition === undefined) {
    throw new Error(`ASHA demo project content is missing ${stableId}`);
  }
  return definition;
}

function requireCapability(entityDefinition, kind) {
  const capability = entityDefinition.capabilities.find((candidate) => candidate.kind === kind);
  if (capability === undefined) {
    throw new Error(`${entityDefinition.stableId} is missing ${kind}`);
  }
  return capability;
}

function stripKind(value) {
  const { kind, sceneDocument, ...withoutKind } = value;
  return withoutKind;
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
