import {
  validateGeneratedWireValue,
  type GameplayCompositionRequirement,
  type GameplayContractRef,
  type GameplayModuleBindingRegistry,
  type GameplayOwnerRef,
  type GameplayTriggerDefinition,
  type GeneratedWireValue,
} from '@asha/contracts';
import type { AshaRendererAnimatedMeshResourceManifest } from '@asha/renderer-host';
import type {
  ProjectBundleLoadRequest,
  RuntimeSessionEcrpEntityDefinition,
  RuntimeSessionEcrpProjectCapabilityDefinition,
  RuntimeSessionEcrpProjectLoadInput,
  RuntimeSessionEcrpSceneDocument,
  RuntimeSessionProjectIdentity,
} from '@asha/runtime-session';

type SourceObject = Readonly<Record<string, unknown>>;

export interface DemoProjectSourceDiagnostic {
  readonly code: 'invalid_source_document';
  readonly path: string;
  readonly message: string;
}

export class DemoProjectSourceError extends Error {
  constructor(readonly diagnostic: DemoProjectSourceDiagnostic) {
    super(`${diagnostic.path}: ${diagnostic.message}`);
    this.name = 'DemoProjectSourceError';
  }
}

export interface DemoProjectBundleSourceFiles {
  readonly entityDefinitions: readonly string[];
  readonly sceneDocument: string;
  readonly catalogRefs: {
    readonly gameplay: string;
    readonly materials: string;
    readonly spawns: string;
    readonly weapon: string;
  };
  readonly prefabRegistry: string;
  readonly levelPreset: string;
  readonly animatedMeshManifest: string;
}

export interface DemoProjectBundle {
  readonly kind: 'ProjectBundle';
  readonly project: RuntimeSessionProjectIdentity;
  readonly runtimeRequest: ProjectBundleLoadRequest;
  readonly catalogs: {
    readonly gameplayCatalogId: string;
    readonly objectModelId: string;
  };
  readonly gameplayRuntime: {
    readonly compositionRequirement: GameplayCompositionRequirement;
    readonly declaredReadPlanHash: string;
    readonly challengeView: GameplayContractRef;
    readonly prefabInteraction: {
      readonly actor: number;
      readonly instance: number;
      readonly role: string;
      readonly expectedTarget: number;
      readonly tick: number;
    };
    readonly scheduler: DemoGameplayRuntimeSchedulerDefinition;
  };
  readonly gameplayModuleBindings: GameplayModuleBindingRegistry;
  readonly gameplayTriggers: readonly GameplayTriggerDefinition[];
  readonly sourceFiles: DemoProjectBundleSourceFiles;
  readonly runtime: {
    readonly sessionId: string;
    readonly seed: number;
    readonly cameraProjection: {
      readonly fovYDegrees: number;
      readonly near: number;
      readonly far: number;
    };
  };
}

export interface DemoGameplayRuntimeSchedulerDefinition {
  readonly owner: GameplayOwnerRef;
  readonly declaredEvents: readonly GameplayContractRef[];
  readonly declaredProposals: readonly GameplayContractRef[];
}

export interface DemoSceneDocument extends RuntimeSessionEcrpSceneDocument {
  readonly levelPresetRef: string;
  readonly generatedTunnelSeed: number;
  readonly materialCatalogRef: string;
  readonly spawnCatalogRef: string;
  readonly staticCollisionSource: string;
  readonly renderSurface: string;
}

export interface DemoGameplayCatalog {
  readonly kind: 'asha_demo.gameplay_catalog_ref.v1';
  readonly catalogId: string;
  readonly defaultPresetId: string;
  readonly defaultPresetHash: string;
  readonly tuningHash: string;
  readonly referenceHash: string;
  readonly refs: {
    readonly levelPreset: string;
    readonly weapon: string;
    readonly enemyEntityDefinition: string;
    readonly spawnCatalog: string;
  };
}

export interface DemoMaterialCatalog {
  readonly kind: 'asha_demo.material_catalog_ref.v1';
  readonly catalogId: string;
  readonly materials: readonly {
    readonly id: string;
    readonly role: string;
  }[];
}

export interface DemoSpawnCatalog {
  readonly kind: 'asha_demo.spawn_catalog.v1';
  readonly catalogId: string;
  readonly markers: readonly {
    readonly markerId: string;
    readonly role: string;
    readonly position: readonly [number, number, number];
    readonly yawDegrees: number;
  }[];
}

export interface DemoWeaponCatalog {
  readonly kind: 'asha_demo.weapon_catalog_entry.v1';
  readonly weaponId: string;
  readonly action: string;
  readonly damage: number;
  readonly rangeUnits: number;
  readonly cooldownTicks: number;
  readonly ammo: number;
  readonly traceRadiusUnits: number;
}

export interface DemoLevelPreset {
  readonly kind: 'asha_demo.generated_tunnel_preset_ref.v1';
  readonly presetId: 'tiny-enclosed';
  readonly seed: number;
  readonly outputHash: string;
  readonly renderProjectionHash: string;
  readonly collisionProjectionHash: string;
  readonly sceneDocument: string;
}

export function decodeDemoProjectBundle(value: unknown): DemoProjectBundle {
  const bundle = sourceObject(value, '$');
  requireLiteral(bundle['kind'], 'ProjectBundle', '$.kind');
  const project = sourceObject(bundle['project'], '$.project');
  const runtimeRequest = sourceObject(bundle['runtimeRequest'], '$.runtimeRequest');
  const catalogs = sourceObject(bundle['catalogs'], '$.catalogs');
  const gameplayRuntime = sourceObject(bundle['gameplayRuntime'], '$.gameplayRuntime');
  const prefabInteraction = sourceObject(
    gameplayRuntime['prefabInteraction'],
    '$.gameplayRuntime.prefabInteraction',
  );
  const scheduler = sourceObject(gameplayRuntime['scheduler'], '$.gameplayRuntime.scheduler');
  const sourceFiles = sourceObject(bundle['sourceFiles'], '$.sourceFiles');
  const catalogRefs = sourceObject(sourceFiles['catalogRefs'], '$.sourceFiles.catalogRefs');
  const runtime = sourceObject(bundle['runtime'], '$.runtime');
  const cameraProjection = sourceObject(runtime['cameraProjection'], '$.runtime.cameraProjection');

  const gameplayModuleBindings = generatedValue<GameplayModuleBindingRegistry>(
    bundle['gameplayModuleBindings'],
    'gameExtension.GameplayModuleBindingRegistry',
    '$.gameplayModuleBindings',
  );
  const gameplayTriggers = sourceArray(bundle['gameplayTriggers'], '$.gameplayTriggers').map(
    (trigger, index) => generatedValue<GameplayTriggerDefinition>(
      trigger,
      'projectBundle.GameplayTriggerDefinition',
      `$.gameplayTriggers[${index}]`,
    ),
  );

  return {
    kind: 'ProjectBundle',
    project: {
      gameId: nonEmptyString(project['gameId'], '$.project.gameId'),
      workspaceId: nonEmptyString(project['workspaceId'], '$.project.workspaceId'),
    },
    runtimeRequest: {
      bundleSchemaVersion: nonNegativeInteger(
        runtimeRequest['bundleSchemaVersion'],
        '$.runtimeRequest.bundleSchemaVersion',
      ),
      protocolVersion: nonNegativeInteger(
        runtimeRequest['protocolVersion'],
        '$.runtimeRequest.protocolVersion',
      ),
      sceneId: nonNegativeInteger(runtimeRequest['sceneId'], '$.runtimeRequest.sceneId'),
    },
    catalogs: {
      gameplayCatalogId: nonEmptyString(catalogs['gameplayCatalogId'], '$.catalogs.gameplayCatalogId'),
      objectModelId: nonEmptyString(catalogs['objectModelId'], '$.catalogs.objectModelId'),
    },
    gameplayRuntime: {
      compositionRequirement: generatedValue<GameplayCompositionRequirement>(
        gameplayRuntime['compositionRequirement'],
        'gameExtension.GameplayCompositionRequirement',
        '$.gameplayRuntime.compositionRequirement',
      ),
      declaredReadPlanHash: nonEmptyString(
        gameplayRuntime['declaredReadPlanHash'],
        '$.gameplayRuntime.declaredReadPlanHash',
      ),
      challengeView: generatedValue<GameplayContractRef>(
        gameplayRuntime['challengeView'],
        'gameExtension.GameplayContractRef',
        '$.gameplayRuntime.challengeView',
      ),
      prefabInteraction: {
        actor: nonNegativeInteger(prefabInteraction['actor'], '$.gameplayRuntime.prefabInteraction.actor'),
        instance: nonNegativeInteger(
          prefabInteraction['instance'],
          '$.gameplayRuntime.prefabInteraction.instance',
        ),
        role: nonEmptyString(prefabInteraction['role'], '$.gameplayRuntime.prefabInteraction.role'),
        expectedTarget: nonNegativeInteger(
          prefabInteraction['expectedTarget'],
          '$.gameplayRuntime.prefabInteraction.expectedTarget',
        ),
        tick: nonNegativeInteger(prefabInteraction['tick'], '$.gameplayRuntime.prefabInteraction.tick'),
      },
      scheduler: {
        owner: generatedValue<GameplayOwnerRef>(
          scheduler['owner'],
          'gameExtension.GameplayOwnerRef',
          '$.gameplayRuntime.scheduler.owner',
        ),
        declaredEvents: decodeContractRefs(
          scheduler['declaredEvents'],
          '$.gameplayRuntime.scheduler.declaredEvents',
        ),
        declaredProposals: decodeContractRefs(
          scheduler['declaredProposals'],
          '$.gameplayRuntime.scheduler.declaredProposals',
        ),
      },
    },
    gameplayModuleBindings,
    gameplayTriggers,
    sourceFiles: {
      entityDefinitions: sourceArray(sourceFiles['entityDefinitions'], '$.sourceFiles.entityDefinitions')
        .map((path, index) => sourcePath(path, `$.sourceFiles.entityDefinitions[${index}]`)),
      sceneDocument: sourcePath(sourceFiles['sceneDocument'], '$.sourceFiles.sceneDocument'),
      catalogRefs: {
        gameplay: sourcePath(catalogRefs['gameplay'], '$.sourceFiles.catalogRefs.gameplay'),
        materials: sourcePath(catalogRefs['materials'], '$.sourceFiles.catalogRefs.materials'),
        spawns: sourcePath(catalogRefs['spawns'], '$.sourceFiles.catalogRefs.spawns'),
        weapon: sourcePath(catalogRefs['weapon'], '$.sourceFiles.catalogRefs.weapon'),
      },
      prefabRegistry: sourcePath(sourceFiles['prefabRegistry'], '$.sourceFiles.prefabRegistry'),
      levelPreset: sourcePath(sourceFiles['levelPreset'], '$.sourceFiles.levelPreset'),
      animatedMeshManifest: sourcePath(
        sourceFiles['animatedMeshManifest'],
        '$.sourceFiles.animatedMeshManifest',
      ),
    },
    runtime: {
      sessionId: nonEmptyString(runtime['sessionId'], '$.runtime.sessionId'),
      seed: nonNegativeInteger(runtime['seed'], '$.runtime.seed'),
      cameraProjection: {
        fovYDegrees: finiteNumber(cameraProjection['fovYDegrees'], '$.runtime.cameraProjection.fovYDegrees'),
        near: positiveNumber(cameraProjection['near'], '$.runtime.cameraProjection.near'),
        far: positiveNumber(cameraProjection['far'], '$.runtime.cameraProjection.far'),
      },
    },
  };
}

export function decodeDemoEntityDefinition(value: unknown, path: string): RuntimeSessionEcrpEntityDefinition {
  const definition = sourceObject(value, path);
  requireLiteral(definition['kind'], 'EntityDefinition', `${path}.kind`);
  return {
    kind: 'EntityDefinition',
    stableId: nonEmptyString(definition['stableId'], `${path}.stableId`),
    displayName: nonEmptyString(definition['displayName'], `${path}.displayName`),
    source: decodeEntitySource(definition['source'], `${path}.source`),
    capabilities: sourceArray(definition['capabilities'], `${path}.capabilities`)
      .map((capability, index) => decodeCapability(capability, `${path}.capabilities[${index}]`)),
  };
}

export function decodeDemoSceneDocument(value: unknown): DemoSceneDocument {
  const scene = sourceObject(value, '$');
  requireLiteral(scene['kind'], 'SceneDocument', '$.kind');
  return {
    kind: 'SceneDocument',
    sceneId: nonEmptyString(scene['sceneId'], '$.sceneId'),
    placements: sourceArray(scene['placements'], '$.placements').map((placement, index) => {
      const item = sourceObject(placement, `$.placements[${index}]`);
      const runtimeEntityId = item['runtimeEntityId'];
      const spawnMarkerId = item['spawnMarkerId'];
      return {
        entityDefinitionId: nonEmptyString(
          item['entityDefinitionId'],
          `$.placements[${index}].entityDefinitionId`,
        ),
        ...(spawnMarkerId === undefined
          ? {}
          : { spawnMarkerId: nonEmptyString(spawnMarkerId, `$.placements[${index}].spawnMarkerId`) }),
        ...(runtimeEntityId === undefined
          ? {}
          : { runtimeEntityId: nonNegativeInteger(runtimeEntityId, `$.placements[${index}].runtimeEntityId`) }),
      };
    }),
    levelPresetRef: nonEmptyString(scene['levelPresetRef'], '$.levelPresetRef'),
    generatedTunnelSeed: nonNegativeInteger(scene['generatedTunnelSeed'], '$.generatedTunnelSeed'),
    materialCatalogRef: sourcePath(scene['materialCatalogRef'], '$.materialCatalogRef'),
    spawnCatalogRef: sourcePath(scene['spawnCatalogRef'], '$.spawnCatalogRef'),
    staticCollisionSource: nonEmptyString(scene['staticCollisionSource'], '$.staticCollisionSource'),
    renderSurface: nonEmptyString(scene['renderSurface'], '$.renderSurface'),
  };
}

export function decodeDemoGameplayCatalog(value: unknown): DemoGameplayCatalog {
  const catalog = sourceObject(value, '$');
  requireLiteral(catalog['kind'], 'asha_demo.gameplay_catalog_ref.v1', '$.kind');
  const refs = sourceObject(catalog['refs'], '$.refs');
  return {
    kind: 'asha_demo.gameplay_catalog_ref.v1',
    catalogId: nonEmptyString(catalog['catalogId'], '$.catalogId'),
    defaultPresetId: nonEmptyString(catalog['defaultPresetId'], '$.defaultPresetId'),
    defaultPresetHash: nonEmptyString(catalog['defaultPresetHash'], '$.defaultPresetHash'),
    tuningHash: nonEmptyString(catalog['tuningHash'], '$.tuningHash'),
    referenceHash: nonEmptyString(catalog['referenceHash'], '$.referenceHash'),
    refs: {
      levelPreset: sourcePath(refs['levelPreset'], '$.refs.levelPreset'),
      weapon: sourcePath(refs['weapon'], '$.refs.weapon'),
      enemyEntityDefinition: sourcePath(refs['enemyEntityDefinition'], '$.refs.enemyEntityDefinition'),
      spawnCatalog: sourcePath(refs['spawnCatalog'], '$.refs.spawnCatalog'),
    },
  };
}

export function decodeDemoMaterialCatalog(value: unknown): DemoMaterialCatalog {
  const catalog = sourceObject(value, '$');
  requireLiteral(catalog['kind'], 'asha_demo.material_catalog_ref.v1', '$.kind');
  return {
    kind: 'asha_demo.material_catalog_ref.v1',
    catalogId: nonEmptyString(catalog['catalogId'], '$.catalogId'),
    materials: sourceArray(catalog['materials'], '$.materials').map((material, index) => {
      const item = sourceObject(material, `$.materials[${index}]`);
      return {
        id: nonEmptyString(item['id'], `$.materials[${index}].id`),
        role: nonEmptyString(item['role'], `$.materials[${index}].role`),
      };
    }),
  };
}

export function decodeDemoSpawnCatalog(value: unknown): DemoSpawnCatalog {
  const catalog = sourceObject(value, '$');
  requireLiteral(catalog['kind'], 'asha_demo.spawn_catalog.v1', '$.kind');
  return {
    kind: 'asha_demo.spawn_catalog.v1',
    catalogId: nonEmptyString(catalog['catalogId'], '$.catalogId'),
    markers: sourceArray(catalog['markers'], '$.markers').map((marker, index) => {
      const item = sourceObject(marker, `$.markers[${index}]`);
      return {
        markerId: nonEmptyString(item['markerId'], `$.markers[${index}].markerId`),
        role: nonEmptyString(item['role'], `$.markers[${index}].role`),
        position: vec3(item['position'], `$.markers[${index}].position`),
        yawDegrees: finiteNumber(item['yawDegrees'], `$.markers[${index}].yawDegrees`),
      };
    }),
  };
}

export function decodeDemoWeaponCatalog(value: unknown): DemoWeaponCatalog {
  const weapon = sourceObject(value, '$');
  requireLiteral(weapon['kind'], 'asha_demo.weapon_catalog_entry.v1', '$.kind');
  return {
    kind: 'asha_demo.weapon_catalog_entry.v1',
    weaponId: nonEmptyString(weapon['weaponId'], '$.weaponId'),
    action: nonEmptyString(weapon['action'], '$.action'),
    damage: nonNegativeInteger(weapon['damage'], '$.damage'),
    rangeUnits: nonNegativeNumber(weapon['rangeUnits'], '$.rangeUnits'),
    cooldownTicks: nonNegativeInteger(weapon['cooldownTicks'], '$.cooldownTicks'),
    ammo: nonNegativeInteger(weapon['ammo'], '$.ammo'),
    traceRadiusUnits: nonNegativeNumber(weapon['traceRadiusUnits'], '$.traceRadiusUnits'),
  };
}

export function decodeDemoLevelPreset(value: unknown): DemoLevelPreset {
  const preset = sourceObject(value, '$');
  requireLiteral(preset['kind'], 'asha_demo.generated_tunnel_preset_ref.v1', '$.kind');
  return {
    kind: 'asha_demo.generated_tunnel_preset_ref.v1',
    presetId: requireLiteral(preset['presetId'], 'tiny-enclosed', '$.presetId'),
    seed: nonNegativeInteger(preset['seed'], '$.seed'),
    outputHash: nonEmptyString(preset['outputHash'], '$.outputHash'),
    renderProjectionHash: nonEmptyString(preset['renderProjectionHash'], '$.renderProjectionHash'),
    collisionProjectionHash: nonEmptyString(
      preset['collisionProjectionHash'],
      '$.collisionProjectionHash',
    ),
    sceneDocument: sourcePath(preset['sceneDocument'], '$.sceneDocument'),
  };
}

export function decodeDemoAnimatedMeshManifest(value: unknown): AshaRendererAnimatedMeshResourceManifest {
  const manifest = sourceObject(value, '$');
  requireLiteral(manifest['kind'], 'asha_renderer_animated_mesh_resources.v0', '$.kind');
  return {
    kind: 'asha_renderer_animated_mesh_resources.v0',
    resources: sourceArray(manifest['resources'], '$.resources').map((resource, index) => {
      const item = sourceObject(resource, `$.resources[${index}]`);
      const licenseUrl = item['licenseUrl'];
      return {
        asset: nonEmptyString(item['asset'], `$.resources[${index}].asset`),
        resourceUrl: sourcePath(item['resourceUrl'], `$.resources[${index}].resourceUrl`, true),
        contentHash: sha256Hash(item['contentHash'], `$.resources[${index}].contentHash`),
        clipIds: sourceArray(item['clipIds'], `$.resources[${index}].clipIds`)
          .map((clip, clipIndex) => nonEmptyString(clip, `$.resources[${index}].clipIds[${clipIndex}]`)),
        licenseUrl: licenseUrl === null
          ? null
          : sourcePath(licenseUrl, `$.resources[${index}].licenseUrl`, true),
      };
    }),
  };
}

function decodeEntitySource(value: unknown, path: string): RuntimeSessionEcrpEntityDefinition['source'] {
  const source = sourceObject(value, path);
  return {
    projectBundle: nonEmptyString(source['projectBundle'], `${path}.projectBundle`),
    relativePath: sourcePath(source['relativePath'], `${path}.relativePath`),
  };
}

function decodeCapability(value: unknown, path: string): RuntimeSessionEcrpProjectCapabilityDefinition {
  const capability = sourceObject(value, path);
  const kind = nonEmptyString(capability['kind'], `${path}.kind`);
  switch (kind) {
    case 'transform': {
      const initial = sourceObject(capability['initial'], `${path}.initial`);
      return {
        kind,
        initial: {
          position: vec3(initial['position'], `${path}.initial.position`),
          yawDegrees: finiteNumber(initial['yawDegrees'], `${path}.initial.yawDegrees`),
          pitchDegrees: finiteNumber(initial['pitchDegrees'], `${path}.initial.pitchDegrees`),
        },
      };
    }
    case 'collisionBody': {
      const staticCollider = capability['staticCollider'];
      const policy = capability['policy'];
      return {
        kind,
        halfExtents: vec3(capability['halfExtents'], `${path}.halfExtents`),
        ...(staticCollider === undefined
          ? {}
          : { staticCollider: booleanValue(staticCollider, `${path}.staticCollider`) }),
        ...(policy === undefined ? {} : { policy: sourceObject(policy, `${path}.policy`) }),
      };
    }
    case 'controller': {
      const controller = capability['controller'];
      if (controller !== 'player_input' && controller !== 'enemy_policy') {
        sourceFailure(`${path}.controller`, 'expected player_input or enemy_policy');
      }
      const tuning = capability['tuning'];
      return {
        kind,
        controller,
        ...(tuning === undefined ? {} : { tuning: sourceObject(tuning, `${path}.tuning`) }),
      };
    }
    case 'health':
      return {
        kind,
        current: nonNegativeNumber(capability['current'], `${path}.current`),
        max: nonNegativeNumber(capability['max'], `${path}.max`),
      };
    case 'weaponMount': {
      const tuning = capability['tuning'];
      return {
        kind,
        weaponId: nonEmptyString(capability['weaponId'], `${path}.weaponId`),
        ...(tuning === undefined ? {} : { tuning: sourceObject(tuning, `${path}.tuning`) }),
      };
    }
    case 'renderProjection': {
      const projection = capability['projection'];
      if (
        projection !== 'first_person_camera'
        && projection !== 'target_cube'
        && projection !== 'spawn_marker'
      ) {
        sourceFailure(`${path}.projection`, 'expected a supported render projection');
      }
      const visible = capability['visible'];
      return {
        kind,
        projection,
        ...(visible === undefined ? {} : { visible: booleanValue(visible, `${path}.visible`) }),
      };
    }
    case 'policyBinding': {
      const policyLoopRef = capability['policyLoopRef'];
      return {
        kind,
        policyId: nonEmptyString(capability['policyId'], `${path}.policyId`),
        ...(policyLoopRef === undefined
          ? {}
          : { policyLoopRef: nonEmptyString(policyLoopRef, `${path}.policyLoopRef`) }),
      };
    }
    case 'spawnMarker':
      return { kind, markerId: nonEmptyString(capability['markerId'], `${path}.markerId`) };
    case 'faction':
      return { kind, factionId: nonEmptyString(capability['factionId'], `${path}.factionId`) };
    default:
      return sourceFailure(path, `unsupported EntityDefinition capability ${kind}`);
  }
}

function decodeContractRefs(value: unknown, path: string): readonly GameplayContractRef[] {
  return sourceArray(value, path).map((entry, index) => generatedValue<GameplayContractRef>(
    entry,
    'gameExtension.GameplayContractRef',
    `${path}[${index}]`,
  ));
}

function generatedValue<T>(value: unknown, typeName: string, path: string): T {
  if (!isGeneratedWireValue(value)) {
    return sourceFailure(path, 'expected canonical JSON data');
  }
  const result = validateGeneratedWireValue(typeName, value, path);
  if (result.valid === false) {
    return sourceFailure(result.issue.path, result.issue.message);
  }
  return value as T;
}

function isGeneratedWireValue(value: unknown): value is GeneratedWireValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isGeneratedWireValue);
  }
  if (typeof value !== 'object') {
    return false;
  }
  return Object.values(value).every(isGeneratedWireValue);
}

function sourceObject(value: unknown, path: string): SourceObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return sourceFailure(path, 'expected object');
  }
  return value as SourceObject;
}

function sourceArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    return sourceFailure(path, 'expected array');
  }
  return value;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return sourceFailure(path, 'expected non-empty string');
  }
  return value;
}

function sourcePath(value: unknown, path: string, allowRooted = false): string {
  const source = nonEmptyString(value, path);
  const normalized = source.replaceAll('\\', '/');
  const pathSegments = normalized.split('/');
  if (
    normalized !== source
    || (!allowRooted && normalized.startsWith('/'))
    || pathSegments.includes('..')
    || pathSegments.includes('.')
    || pathSegments.some((segment, index) => segment.length === 0 && index > 0)
  ) {
    return sourceFailure(path, 'expected a bounded project-relative source path');
  }
  return source;
}

function requireLiteral<T extends string>(value: unknown, literal: T, path: string): T {
  if (value !== literal) {
    return sourceFailure(path, `expected ${literal}`);
  }
  return literal;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    return sourceFailure(path, 'expected boolean');
  }
  return value;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return sourceFailure(path, 'expected finite number');
  }
  return value;
}

function nonNegativeNumber(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  return number < 0 ? sourceFailure(path, 'expected non-negative number') : number;
}

function positiveNumber(value: unknown, path: string): number {
  const number = finiteNumber(value, path);
  return number <= 0 ? sourceFailure(path, 'expected positive number') : number;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return sourceFailure(path, 'expected non-negative safe integer');
  }
  return value;
}

function vec3(value: unknown, path: string): readonly [number, number, number] {
  const items = sourceArray(value, path);
  if (items.length !== 3) {
    return sourceFailure(path, 'expected three-number tuple');
  }
  return [
    finiteNumber(items[0], `${path}[0]`),
    finiteNumber(items[1], `${path}[1]`),
    finiteNumber(items[2], `${path}[2]`),
  ];
}

function sha256Hash(value: unknown, path: string): `sha256:${string}` {
  const hash = nonEmptyString(value, path);
  if (!/^sha256:[0-9a-f]{64}$/u.test(hash)) {
    return sourceFailure(path, 'expected sha256:<64 lowercase hex>');
  }
  return hash as `sha256:${string}`;
}

function sourceFailure(path: string, message: string): never {
  throw new DemoProjectSourceError({ code: 'invalid_source_document', path, message });
}

export type DemoRuntimeProjectLoadInput = RuntimeSessionEcrpProjectLoadInput;
