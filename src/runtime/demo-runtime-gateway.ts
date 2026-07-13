import {
  RuntimeBridgeError,
  assertNativeRustRuntimeBridgeAuthority,
  createDefaultBrowserInputCatalog,
  createRuntimeSessionFacade,
  readRuntimeSessionPlayableEncounterTick,
  readRuntimeSessionPlayableLoopState,
  resolveNativeRustRuntimeBridgeProvider,
} from '@asha/runtime-bridge';
import type { GameplayRuntimeHostTransport } from '@asha/runtime-session';

export async function createDemoRuntimeBackend(content: any): Promise<any> {
  try {
    const providerResolution = await resolveNativeRustRuntimeBridgeProvider({
      globalScope: globalThis as Record<string, any>,
      providerGlobalNames: ['ashaDemoRuntimeBridge', 'ashaRuntimeBridge'],
    });
    const profile = providerResolution.profile;
    if (providerResolution.status !== 'available') {
      const diagnostic = providerResolution.diagnostics[0] ?? {
        code: 'missing_rust_runtime_backend',
        message:
          'ASHA demo requires a public native Rust RuntimeBridge provider; static browser mode does not fall back to reference authority.',
      };
      return unavailableRuntimeBackend(profile, diagnostic.code, diagnostic.message);
    }

    const bridge = providerResolution.bridge;

    const gameplayHost = providerResolution.provider.gameplayHost as GameplayRuntimeHostTransport | undefined;
    if (gameplayHost === undefined) {
      return unavailableRuntimeBackend(
        profile,
        'missing_gameplay_runtime_host',
        'ASHA demo requires its statically linked Rust gameplay host; the native provider did not expose one.',
      );
    }
    const session = createRuntimeSessionFacade({ bridge, gameplayHost, mode: 'rust' });
    session.initialize({
      sessionId: content.runtime.sessionId,
      seed: content.runtime.seed,
      project: content.projectBundle.project,
      projectBundle: content.projectBundle.runtimeRequest,
    });
    const loadReceipt = session.loadEcrpProject({
      kind: 'runtime_session.load_ecrp_project.v0',
      projectBundle: content.projectBundle,
      entityDefinitions: content.entityDefinitions,
      sceneDocument: content.sceneDocument,
      gameRuleModules: content.gameRuleModules,
    });

    if (!loadReceipt.accepted) {
      return unavailableRuntimeBackend(
        profile,
        'rust_runtime_rejected_project',
        `Rust RuntimeSession rejected demo ECRP content: ${formatLoadDiagnostics(loadReceipt.diagnostics)}`,
        loadReceipt,
        'rust_backend_failed',
      );
    }
    const generatedTunnelOperation = session.requestGeneratedTunnelOperation({
      operation: 'apply_to_runtime_world',
      presetId: content.catalogs.levelPreset.presetId,
      seed: content.catalogs.levelPreset.seed,
    });
    if (generatedTunnelOperation.status !== 'applied') {
      return unavailableRuntimeBackend(
        profile,
        'generated_tunnel_collision_unavailable',
        `Rust RuntimeSession did not apply the generated tunnel collision projection: ${generatedTunnelOperation.detail}`,
        loadReceipt,
        'rust_backend_failed',
      );
    }
    if (
      generatedTunnelOperation.presetId !== content.catalogs.levelPreset.presetId
      || generatedTunnelOperation.seed !== content.catalogs.levelPreset.seed
      || generatedTunnelOperation.outputHash !== content.catalogs.levelPreset.outputHash
    ) {
      return unavailableRuntimeBackend(
        profile,
        'generated_tunnel_collision_mismatch',
        'Rust RuntimeSession applied a generated tunnel that does not match the durable demo level preset.',
        loadReceipt,
        'rust_backend_failed',
      );
    }
    const gameplayLoadInput = {
      kind: 'gameplay_runtime_host.load.v1' as const,
      projectId: content.projectBundle.project.gameId,
      compositionHash: content.projectBundle.gameplayRuntime.compositionHash,
      declaredReadPlanHash: content.projectBundle.gameplayRuntime.declaredReadPlanHash,
      bindings: content.projectBundle.gameplayModuleBindings,
      triggers: content.projectBundle.gameplayTriggers,
      scheduler: content.projectBundle.gameplayRuntime.scheduler,
      prefabs: content.prefabAuthoring.runtimeBootstrap,
    };
    const gameplayLoadReceipt = session.loadGameplayRuntime(gameplayLoadInput);
    if (!gameplayLoadReceipt.accepted) {
      return unavailableRuntimeBackend(
        profile,
        'gameplay_runtime_rejected_project',
        `Rust gameplay host rejected demo ProjectBundle composition: ${gameplayLoadReceipt.diagnostics.join('; ')}`,
        loadReceipt,
        'rust_backend_failed',
      );
    }
    const prefabInteractionReceipt = session.advanceGameplayRuntime({
      kind: 'prefabInteraction',
      tick: 1,
      instance: 701,
      role: 'interaction/sensor',
    });
    if (!prefabInteractionReceipt.accepted) {
      return unavailableRuntimeBackend(
        profile,
        'prefab_interaction_rejected',
        `Rust gameplay host rejected the stable prefab-part interaction: ${prefabInteractionReceipt.diagnostics.join('; ')}`,
        loadReceipt,
        'rust_backend_failed',
      );
    }
    const prefabRuntimeReadout = gameplayHost.read();
    if (
      prefabRuntimeReadout.prefabs?.instances?.length !== 2
      || prefabRuntimeReadout.prefabs?.acceptedCommands?.length !== 2
      || prefabRuntimeReadout.moduleStates?.length !== 3
    ) {
      return unavailableRuntimeBackend(
        profile,
        'prefab_runtime_readout_incomplete',
        'Rust gameplay host did not retain both prefab instances, placement commands, and three resolved module-state scopes.',
        loadReceipt,
        'rust_backend_failed',
      );
    }
    const readout = session.readEcrpRuntimeReadout();
    const snapshot = bridge.readFpsRuntimeSession();
    assertNativeRustRuntimeBridgeAuthority({
      ecrpAuthority: readout.authority,
      fpsSnapshot: snapshot,
    });

    return {
      available: true,
      status: 'rust_authority',
      session,
      loadReceipt,
      generatedTunnelOperation,
      gameplayLoadReceipt,
      gameplayLoadInput,
      prefabInteractionReceipt,
      prefabRuntimeReadout,
      diagnostics: [],
      profile,
      backendHash: loadReceipt.bootstrapHash ?? 'rust-authority:loaded',
      gameRuleModules: content.gameRuleModules,
    };
  } catch (error) {
    const diagnostic = errorToBackendDiagnostic(error);
    return unavailableRuntimeBackend(
      {
        kind: 'runtime_bridge.native_rust_provider_profile.v1',
        mode: 'rust',
        transport: 'public_runtime_bridge_provider',
        providerGlobal: 'globalThis.ashaDemoRuntimeBridge',
        providerContract: 'asha_demo.native_runtime_bridge_provider.v1',
        requiredBackend: 'native_rust',
        productAuthority: true,
        referenceFallback: false,
      },
      diagnostic.code,
      diagnostic.message,
    );
  }
}

export function createDemoRuntimeGateway(runtimeBackend: any): any {
  const session = runtimeBackend.session;
  const gameRuleModule = runtimeBackend.gameRuleModules?.[0] ?? null;
  return {
    available() {
      return session !== null;
    },
    applyCollisionConstrainedCameraInput(input: any) {
      return session?.applyCollisionConstrainedCameraInput(input) ?? null;
    },
    createCamera(input: any) {
      return session?.createCamera(input) ?? null;
    },
    inputSession() {
      return session;
    },
    readInputContextState() {
      return session?.readInputContextState() ?? null;
    },
    readTimeControlState() {
      return session?.readTimeControlState() ?? null;
    },
    readEcrpRuntimeReadout() {
      return session?.readEcrpRuntimeReadout() ?? null;
    },
    readAnimationIntent() {
      return session?.readAnimationIntent() ?? null;
    },
    readLifecycleStatus() {
      return session?.readLifecycleStatus() ?? null;
    },
    readPlayableLoopState(shell: any) {
      if (session === null) {
        return null;
      }
      return readRuntimeSessionPlayableLoopState(session, { shell });
    },
    readPlayableEncounterTick(input: any) {
      if (session === null) {
        return null;
      }
      return readRuntimeSessionPlayableEncounterTick(session, input);
    },
    readTelemetry() {
      return session?.readTelemetry() ?? null;
    },
    readProjection() {
      return session?.readProjection() ?? null;
    },
    readGameplayRuntime() {
      return session?.readGameplayRuntime() ?? null;
    },
    advanceGameplayRuntime(moment: any) {
      return session?.advanceGameplayRuntime(moment) ?? null;
    },
    saveGameplayRuntime() {
      return session?.saveGameplayRuntime() ?? null;
    },
    restoreGameplayRuntime(snapshot: any) {
      if (session === null || runtimeBackend.gameplayLoadInput === undefined) {
        return null;
      }
      return session.restoreGameplayRuntime(runtimeBackend.gameplayLoadInput, snapshot);
    },
    requestSessionRestart(input: any) {
      return session?.requestSessionRestart(input) ?? null;
    },
    submitPrimaryFire(input: any) {
      if (session !== null && gameRuleModule !== null) {
        return submitGameRulePrimaryFire(session, gameRuleModule, input);
      }
      return session?.submitRuntimeActionIntent({
        kind: 'runtime_action_intent.v0',
        action: 'primary_fire',
        ...input,
      }) ?? null;
    },
  };
}

export async function createDemoInputReplaySession(content: any): Promise<any> {
  const replayContent = {
    ...content,
    runtime: {
      ...content.runtime,
      sessionId: `${content.runtime.sessionId}.input-replay`,
    },
  };
  const runtimeBackend = await createDemoRuntimeBackend(replayContent);
  if (!runtimeBackend.available || runtimeBackend.session === null) {
    throw new RuntimeBridgeError(
      'native_unavailable',
      runtimeBackend.diagnostics[0]?.message
        ?? 'ASHA input replay requires a fresh fully loaded native Rust RuntimeSession.',
    );
  }

  const session = runtimeBackend.session;
  session.configureInputSession({
    catalog: createDefaultBrowserInputCatalog(),
    initialContexts: ['gameplay'],
  });
  return {
    session,
    gateway: createDemoRuntimeGateway(runtimeBackend),
  };
}

function submitGameRulePrimaryFire(session: any, gameRuleModule: any, input: any): any {
  const readout = session.readEcrpRuntimeReadout();
  const source = readEntityId(readout, 'actor/demo-player') ?? 10;
  const target = readEntityId(readout, 'actor/generated-tunnel-enemy');
  const baseDamage = Number(input.baseDamage ?? 40);
  const rangeMillimeters = readTargetRangeMillimeters(
    readout,
    target,
    input.camera?.pose?.position ?? input.camera?.position,
  )
    ?? Number(input.rangeMillimeters ?? 1_500);
  const hookId = gameRuleModule.declaredHooks[0]?.hookId ?? 'demo.primary_fire_effect.weapon';
  const hook = {
    moduleRef: gameRuleModule.moduleRef,
    hookId,
    requestId: `asha-demo.primary-fire.${input.tick}`,
    tick: input.tick,
    source,
    target,
    baseDamage,
    rangeMillimeters,
    tags: ['asha-demo', 'primary-fire', 'browser-fps-pointer'],
    inputHash: stableInputHash({
      moduleRef: gameRuleModule.moduleRef,
      hookId,
      tick: input.tick,
      source,
      target,
      baseDamage,
      rangeMillimeters,
    }),
  };
  const pose = input.camera?.pose ?? input.camera ?? {};
  const primaryFire = {
    tick: input.tick,
    origin: pose.position ?? [0, 1.62, 1.25],
    direction: directionFromPose(pose),
  };
  const extensionReceipt = session.submitGameExtensionWeaponEffect(hook, primaryFire);
  const accepted = extensionReceipt.primaryFire !== null;
  return {
    kind: 'asha_demo.game_rule_primary_fire_receipt.v1',
    accepted,
    status: accepted ? 'accepted' : 'rejected',
    rejection: accepted ? null : extensionReceipt.hookReceipt.diagnostics[0] ?? null,
    extension: extensionReceipt,
    hookReceipt: extensionReceipt.hookReceipt,
    replayEvidence: extensionReceipt.replayEvidence,
    primaryFire: extensionReceipt.primaryFire,
    combatReadout: combatReadoutFromPrimaryFire(extensionReceipt.primaryFire),
    sessionHashBefore: extensionReceipt.sessionHashBefore,
    sessionHashAfter: extensionReceipt.sessionHashAfter,
  };
}

function readTargetRangeMillimeters(
  readout: any,
  target: number | null,
  sourcePosition: readonly number[] | undefined,
): number | null {
  if (target === null || !Array.isArray(sourcePosition) || sourcePosition.length !== 3) {
    return null;
  }
  const targetPosition = readEntityPosition(readout, target);
  if (targetPosition === null) {
    return null;
  }
  const dx = sourcePosition[0] - targetPosition[0];
  const dy = sourcePosition[1] - targetPosition[1];
  const dz = sourcePosition[2] - targetPosition[2];
  return Math.round(Math.hypot(dx, dy, dz) * 1000);
}

function readEntityPosition(readout: any, entity: number): readonly [number, number, number] | null {
  const capability = readout.entities
    .find((candidate: any) => candidate.entity === entity)
    ?.capabilities.find((candidate: any) => candidate.kind === 'transform');
  const position = capability?.position ?? capability?.translation ?? capability?.initial?.position;
  return Array.isArray(position) && position.length === 3
    ? [Number(position[0]), Number(position[1]), Number(position[2])]
    : null;
}

function readEntityId(readout: any, definitionStableId: string): number | null {
  return readout.entities.find((entity: any) => entity.definitionStableId === definitionStableId)?.entity ?? null;
}

function directionFromPose(pose: any): readonly [number, number, number] {
  const yaw = (Number(pose.yawDegrees ?? 0) * Math.PI) / 180;
  const pitch = (Number(pose.pitchDegrees ?? 0) * Math.PI) / 180;
  const x = Math.sin(yaw) * Math.cos(pitch);
  const y = Math.sin(pitch);
  const z = -Math.cos(yaw) * Math.cos(pitch);
  return [roundUnit(x), roundUnit(y), roundUnit(z)];
}

function roundUnit(value: number): number {
  return Number(value.toFixed(6));
}

function combatReadoutFromPrimaryFire(primaryFire: any): any {
  if (primaryFire === null) {
    return {
      outcome: { kind: 'rejected' },
    };
  }
  return {
    outcome: {
      kind: primaryFire.target === null ? 'miss' : 'hit',
      target: primaryFire.target,
      targetHealthBefore: primaryFire.targetHealthBefore,
      targetHealthAfter: primaryFire.targetHealthAfter,
    },
    replayHash: primaryFire.replayHash,
  };
}

function stableInputHash(value: any): string {
  let hash = 0xcbf29ce484222325n;
  const text = JSON.stringify(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function unavailableRuntimeBackend(
  profile: any,
  code: string,
  message: string,
  loadReceipt: any = null,
  status = 'missing_rust_backend',
): any {
  return {
    available: false,
    status,
    session: null,
    loadReceipt: loadReceipt ?? {
      kind: 'runtime_session.ecrp_project_load_receipt.v0',
      sequenceId: 0,
      accepted: false,
      diagnostics: [{ code, path: 'runtime.backend', detail: message }],
      entityCount: 0,
      bootstrapHash: null,
      sessionHashBefore: 'missing-rust-backend',
      sessionHashAfter: 'missing-rust-backend',
    },
    diagnostics: [{ code, severity: 'error', message }],
    generatedTunnelOperation: null,
    profile,
    backendHash: `missing-rust-backend:${code}`,
  };
}

function errorToBackendDiagnostic(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof RuntimeBridgeError) {
    return {
      code: error.kind === 'native_unavailable' ? 'missing_rust_runtime_backend' : error.kind,
      message: error.message,
    };
  }
  return {
    code: 'runtime_backend_error',
    message: error instanceof Error ? error.message : String(error),
  };
}

function formatLoadDiagnostics(diagnostics: readonly any[]): string {
  return diagnostics
    .map((diagnostic) => `${diagnostic.code}:${diagnostic.path}`)
    .join('; ');
}
