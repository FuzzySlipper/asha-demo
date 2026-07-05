import {
  findFpsEcrpObjectModelEntry,
  readFpsEcrpObjectModel,
  readFpsGameplayPresetCatalog,
} from '@asha/catalog-core';

const objectModelReadout = readFpsEcrpObjectModel();
const gameplayCatalogReadout = readFpsGameplayPresetCatalog();
const gameplayPreset = gameplayCatalogReadout.defaultPreset.preset;
const playerModel = findFpsEcrpObjectModelEntry('player');
const enemyModel = findFpsEcrpObjectModelEntry('enemy');

const playerEntityDefinition = {
  kind: 'EntityDefinition',
  stableId: playerModel.entityDefinitionId,
  displayName: playerModel.displayName,
  source: {
    projectBundle: 'asha-demo',
    relativePath: playerModel.sourcePath,
  },
  capabilities: [
    {
      kind: 'transform',
      initial: {
        position: [0, 1.62, 0],
        yawDegrees: 0,
        pitchDegrees: 0,
      },
    },
    {
      kind: 'collisionBody',
      halfExtents: [0.25, 0.7, 0.25],
      policy: {
        mode: 'axis_separable_slide',
        maxIterations: 3,
      },
    },
    {
      kind: 'controller',
      controller: 'player_input',
      tuning: gameplayPreset.playerController,
    },
    {
      kind: 'health',
      current: 100,
      max: 100,
    },
    {
      kind: 'weaponMount',
      weaponId: gameplayPreset.weapon.weaponId,
      tuning: gameplayPreset.weapon,
    },
    {
      kind: 'renderProjection',
      projection: 'first_person_camera',
    },
    {
      kind: 'faction',
      factionId: 'player',
    },
  ],
};

const enemyEntityDefinition = {
  kind: 'EntityDefinition',
  stableId: enemyModel.entityDefinitionId,
  displayName: enemyModel.displayName,
  source: {
    projectBundle: 'asha-demo',
    relativePath: enemyModel.sourcePath,
  },
  capabilities: [
    {
      kind: 'transform',
      initial: {
        position: [0, 1.1, -3.5],
        yawDegrees: 180,
        pitchDegrees: 0,
      },
    },
    {
      kind: 'collisionBody',
      halfExtents: [0.7, 0.9, 0.7],
      policy: {
        mode: 'runtime_collision_body',
      },
    },
    {
      kind: 'health',
      current: gameplayPreset.weapon.damage,
      max: gameplayPreset.weapon.damage,
    },
    {
      kind: 'renderProjection',
      projection: 'target_cube',
    },
    {
      kind: 'policyBinding',
      policyId: 'policy.enemy.generated_tunnel.v0',
      policyLoopRef: gameplayPreset.enemyBehavior.policyRef,
    },
    {
      kind: 'spawnMarker',
      markerId: 'spawn.enemy.primary',
    },
    {
      kind: 'faction',
      factionId: 'hostile',
    },
  ],
};

export const demoProjectContent = {
  kind: 'asha_demo.ecrp_project_content.v0',
  projectBundle: {
    kind: 'ProjectBundle',
    project: {
      gameId: 'asha-demo',
      workspaceId: 'workspace.local',
    },
    runtimeRequest: {
      bundleSchemaVersion: 1,
      protocolVersion: 1,
      sceneId: 4103,
    },
    catalogs: {
      gameplayCatalogId: gameplayCatalogReadout.catalog.catalogId,
      objectModelId: objectModelReadout.model.modelId,
    },
  },
  entityDefinitions: [
    playerEntityDefinition,
    enemyEntityDefinition,
  ],
  sceneDocument: {
    kind: 'SceneDocument',
    sceneId: 'asha-demo.generated-tunnel-flat-room.v0',
    levelPresetRef: gameplayPreset.generator.presetId,
    generatedTunnelSeed: gameplayPreset.generator.seed,
    placements: [
      {
        entityDefinitionId: playerEntityDefinition.stableId,
        spawnMarkerId: 'spawn.player.start',
      },
      {
        entityDefinitionId: enemyEntityDefinition.stableId,
        spawnMarkerId: 'spawn.enemy.primary',
      },
    ],
    staticCollisionSource: 'RuntimeSessionFacade.applyCollisionConstrainedCameraInput',
    renderSurface: 'mountAshaRendererBrowserSurface',
  },
  catalogs: {
    gameplay: gameplayCatalogReadout,
    ecrpObjectModel: objectModelReadout,
  },
  runtime: {
    sessionId: 'asha-demo.playable.ecrp',
    seed: 4103,
    initialCameraPose: playerEntityDefinition.capabilities[0].initial,
    collisionShape: {
      halfExtents: playerEntityDefinition.capabilities[1].halfExtents,
    },
    collisionPolicy: playerEntityDefinition.capabilities[1].policy,
    cameraProjection: {
      fovYDegrees: 55,
      near: 0.1,
      far: 100,
    },
  },
};

export function readDemoProjectContentStatus() {
  const diagnostics = [];
  const entityDefinitionIds = new Set(
    demoProjectContent.entityDefinitions.map((definition) => definition.stableId),
  );

  for (const entry of objectModelReadout.model.entries) {
    if (!entityDefinitionIds.has(entry.entityDefinitionId)) {
      diagnostics.push(`missing EntityDefinition for ${entry.entityDefinitionId}`);
      continue;
    }
    const definition = demoProjectContent.entityDefinitions.find(
      (candidate) => candidate.stableId === entry.entityDefinitionId,
    );
    const capabilityKinds = new Set(definition.capabilities.map((capability) => capability.kind));
    for (const capabilityKind of entry.capabilityKinds) {
      if (!capabilityKinds.has(capabilityKind)) {
        diagnostics.push(`${entry.entityDefinitionId} missing ${capabilityKind} capability`);
      }
    }
  }

  return {
    kind: 'asha_demo.project_content_status.v0',
    valid: diagnostics.length === 0,
    diagnostics,
    projectBundleId: demoProjectContent.projectBundle.project.gameId,
    entityDefinitionCount: demoProjectContent.entityDefinitions.length,
    sceneId: demoProjectContent.sceneDocument.sceneId,
    gameplayPresetHash: gameplayCatalogReadout.defaultPreset.hashes.presetHash,
    ecrpObjectModelHash: objectModelReadout.hashes.modelHash,
  };
}
