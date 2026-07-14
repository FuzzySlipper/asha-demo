import {
  applyAshaPrefabAuthoringCommand,
  createAshaPrefabAuthoringState,
  createAshaPrefabCommand,
  instantiateAshaPrefabCommand,
  readAshaPrefabAuthoring,
  serializeAshaPrefabRegistrySource,
  type AshaPrefabAuthoringCommand,
  type AshaPrefabAuthoringReadout,
} from '@asha/game-workspace';
import {
  prefabId,
  prefabInstanceId,
  type GameplayModuleBindingRegistry,
  type PrefabDefinition,
  type PrefabRegistry,
} from '@asha/contracts';

type InstantiatePrefabCommand = Extract<AshaPrefabAuthoringCommand, { readonly kind: 'instantiatePrefab' }>;

export interface DemoPrefabRuntimeBootstrap {
  readonly registryJson: string;
  readonly catalog: {
    readonly assetIds: readonly string[];
    readonly entityDefinitionIds: readonly string[];
  };
  readonly placements: readonly DemoPrefabRuntimePlacement[];
}

export interface DemoPrefabRuntimePlacement {
  readonly commandId: string;
  readonly origin: 'authored' | 'player';
  readonly instance: number;
  readonly prefab: number;
  readonly seed: number;
  readonly transform: InstantiatePrefabCommand['record']['transform'];
  readonly overrides: readonly ({ readonly targetRole: string } &
    InstantiatePrefabCommand['record']['overrides'][number]['value'])[];
}

export interface DemoPrefabAuthoring {
  readonly readout: AshaPrefabAuthoringReadout;
  readonly registryJson: string;
  readonly runtimeBootstrap: DemoPrefabRuntimeBootstrap;
}

export function buildDemoPrefabAuthoring(
  prefabRegistry: PrefabRegistry,
  gameplayBindings: GameplayModuleBindingRegistry,
): DemoPrefabAuthoring {
  let state = createAshaPrefabAuthoringState(gameplayBindings);
  for (const definition of definitionInsertionOrder(prefabRegistry)) {
    const result = applyAshaPrefabAuthoringCommand(state, createAshaPrefabCommand(definition));
    if (!result.ok) {
      throw new Error(`Demo prefab definition failed public authoring validation: ${formatDiagnostics(result.diagnostics)}`);
    }
    state = result.state;
  }

  const placements: readonly InstantiatePrefabCommand[] = [
    requireInstantiateCommand(instantiateAshaPrefabCommand({
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
    })),
    requireInstantiateCommand(instantiateAshaPrefabCommand({
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
    })),
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

function toRuntimePlacement(
  command: InstantiatePrefabCommand,
): DemoPrefabRuntimePlacement {
  return {
    commandId: `demo.place-prefab.${command.record.instance}`,
    origin: command.origin,
    instance: command.record.instance,
    prefab: command.record.prefab,
    seed: command.record.seed,
    transform: command.record.transform,
    overrides: command.record.overrides.map((override) => ({
      targetRole: override.targetRole,
      ...override.value,
    })),
  };
}

function requireInstantiateCommand(command: AshaPrefabAuthoringCommand): InstantiatePrefabCommand {
  if (command.kind !== 'instantiatePrefab') {
    throw new Error('Demo prefab runtime bootstrap accepts only instantiate commands');
  }
  return command;
}

function definitionInsertionOrder(registry: PrefabRegistry): readonly PrefabDefinition[] {
  const definitions = new Map(registry.definitions.map((definition) => [definition.id, definition]));
  const ordered: PrefabDefinition[] = [];
  const added = new Set<number>();
  const active = new Set<number>();

  const addDefinition = (definition: PrefabDefinition): void => {
    if (added.has(definition.id)) {
      return;
    }
    if (active.has(definition.id)) {
      throw new Error(`Demo prefab definition order encountered variant cycle at ${definition.id}`);
    }
    active.add(definition.id);
    if (definition.variant !== null) {
      const base = definitions.get(definition.variant.base);
      if (base === undefined) {
        throw new Error(`Demo prefab definition ${definition.id} is missing base ${definition.variant.base}`);
      }
      addDefinition(base);
    }
    active.delete(definition.id);
    added.add(definition.id);
    ordered.push(definition);
  };

  for (const definition of registry.definitions) {
    addDefinition(definition);
  }
  return ordered;
}

function formatDiagnostics(diagnostics: readonly { code: string; path: string }[]): string {
  return diagnostics.map((diagnostic) => `${diagnostic.code}:${diagnostic.path}`).join(', ');
}
