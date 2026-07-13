import {
  applyAshaPrefabAuthoringCommand,
  createAshaPrefabAuthoringState,
  createAshaPrefabCommand,
  instantiateAshaPrefabCommand,
  readAshaPrefabAuthoring,
  serializeAshaPrefabRegistrySource,
} from '@asha/game-workspace';
import { prefabId, prefabInstanceId } from '@asha/contracts';

export function buildDemoPrefabAuthoring(prefabRegistry: any, gameplayBindings: any): any {
  let state = createAshaPrefabAuthoringState(gameplayBindings);
  for (const definition of prefabRegistry.definitions ?? []) {
    const result = applyAshaPrefabAuthoringCommand(state, createAshaPrefabCommand(definition));
    if (!result.ok) {
      throw new Error(`Demo prefab definition failed public authoring validation: ${formatDiagnostics(result.diagnostics)}`);
    }
    state = result.state;
  }

  const placements = [
    instantiateAshaPrefabCommand({
      origin: 'authored',
      instance: prefabInstanceId(700),
      prefab: prefabId(70),
      seed: 4103,
      transform: {
        translation: [-2, 0, -1],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      overrides: [{
        targetRole: 'console/body',
        value: { field: 'entityDefinition', stableId: 'demo.console.body.blue' },
      }],
    }),
    instantiateAshaPrefabCommand({
      origin: 'player',
      instance: prefabInstanceId(701),
      prefab: prefabId(70),
      seed: 4104,
      transform: {
        translation: [2, 0, -1],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      overrides: [{
        targetRole: 'console/body',
        value: { field: 'entityDefinition', stableId: 'demo.console.body.red' },
      }],
    }),
  ];
  for (const command of placements) {
    const result = applyAshaPrefabAuthoringCommand(state, command);
    if (!result.ok) {
      throw new Error(`Demo prefab placement failed public authoring validation: ${formatDiagnostics(result.diagnostics)}`);
    }
    state = result.state;
  }

  return {
    readout: readAshaPrefabAuthoring(state),
    registryJson: serializeAshaPrefabRegistrySource(state.registry),
    runtimeBootstrap: {
      registryJson: serializeAshaPrefabRegistrySource(state.registry),
      catalog: {
        assetIds: [],
        entityDefinitionIds: [
          'demo.console.body',
          'demo.console.body.blue',
          'demo.console.body.red',
          'demo.console.sensor',
        ],
      },
      placements: placements.map(toRuntimePlacement),
    },
  };
}

function toRuntimePlacement(command: any): any {
  if (command.kind !== 'instantiatePrefab') {
    throw new Error('Demo prefab runtime bootstrap accepts only instantiate commands');
  }
  return {
    commandId: `demo.place-prefab.${command.record.instance}`,
    origin: command.origin,
    instance: command.record.instance,
    prefab: command.record.prefab,
    seed: command.record.seed,
    transform: command.record.transform,
    overrides: command.record.overrides.map((override: any) => ({
      targetRole: override.targetRole,
      ...override.value,
    })),
  };
}

function formatDiagnostics(diagnostics: readonly { code: string; path: string }[]): string {
  return diagnostics.map((diagnostic) => `${diagnostic.code}:${diagnostic.path}`).join(', ');
}
