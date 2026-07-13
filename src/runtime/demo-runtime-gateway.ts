import {
  RuntimeBridgeError,
  assertNativeRustRuntimeBridgeAuthority,
  createDefaultBrowserInputCatalog,
  createRuntimeSessionFacade,
  readRuntimeSessionPlayableEncounterTick,
  readRuntimeSessionPlayableLoopState,
  resolveNativeRustRuntimeBridgeProvider,
} from '@asha/runtime-bridge';

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

    const session = createRuntimeSessionFacade({ bridge, mode: 'rust' });
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
    const composedBeforeInteraction = bridge.readComposedRuntimeSession();
    if (
      composedBeforeInteraction.gameplay.gameplayRegistryDigest
        !== content.projectBundle.gameplayRuntime.compositionHash
      || composedBeforeInteraction.gameplay.bindingRegistryHash
        !== content.projectBundle.gameplayModuleBindings.registryHash
    ) {
      return unavailableRuntimeBackend(
        profile,
        'composed_runtime_contract_mismatch',
        'The statically linked Rust RuntimeSession composition does not match the durable ProjectBundle contract.',
        loadReceipt,
        'rust_backend_failed',
      );
    }
    const prefabInteractionReceipt = bridge.applyGameplayPrefabPartInteraction({
      ...content.projectBundle.gameplayRuntime.prefabInteraction,
      expectedRuntimeSessionHash: composedBeforeInteraction.runtimeSessionHash,
    });
    const composedRuntimeReadout = bridge.readComposedRuntimeSession();
    if (prefabInteractionReceipt.runtimeSessionHash !== composedRuntimeReadout.runtimeSessionHash) {
      return unavailableRuntimeBackend(
        profile,
        'prefab_interaction_hash_mismatch',
        'The prefab-part interaction did not return the current composed RuntimeSession hash.',
        loadReceipt,
        'rust_backend_failed',
      );
    }
    const challengeView = readChallengeState(
      bridge,
      content.projectBundle.gameplayRuntime.challengeView,
      composedRuntimeReadout.runtimeSessionHash,
    );
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
      bridge,
      composedRuntimeReadout,
      prefabInteractionReceipt,
      challengeView,
      diagnostics: [],
      profile,
      backendHash: loadReceipt.bootstrapHash ?? 'rust-authority:loaded',
      challengeViewContract: content.projectBundle.gameplayRuntime.challengeView,
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
  const bridge = runtimeBackend.bridge;
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
      return bridge?.readComposedRuntimeSession().gameplay ?? null;
    },
    readComposedRuntimeSession() {
      return bridge?.readComposedRuntimeSession() ?? null;
    },
    readGameplayChallengeState() {
      if (bridge === undefined) {
        return null;
      }
      const composed = bridge.readComposedRuntimeSession();
      return readChallengeState(
        bridge,
        runtimeBackend.challengeViewContract,
        composed.runtimeSessionHash,
      );
    },
    requestSessionRestart(input: any) {
      return session?.requestSessionRestart(input) ?? null;
    },
    submitPrimaryFire(input: any) {
      if (session === null) {
        return null;
      }
      const actionReceipt = session.submitRuntimeActionIntent({
        kind: 'runtime_action_intent.v0',
        action: 'primary_fire',
        phase: input.phase,
        camera: runtimeCameraHandle(input.camera),
        tick: input.tick,
        source: input.source,
        pressed: input.pressed,
      });
      const composedRuntime = bridge.readComposedRuntimeSession();
      const challengeState = readChallengeState(
        bridge,
        runtimeBackend.challengeViewContract,
        composedRuntime.runtimeSessionHash,
      );
      return {
        ...actionReceipt,
        gameplayTransform: {
          moduleId: 'demo.primary-fire-effect',
          status: actionReceipt.accepted ? 'accepted' : 'rejected',
          damageApplied: readDamageApplied(actionReceipt.combatReadout),
          workspaceTrace: actionReceipt.combatReadout?.authority?.workspaceTrace ?? [],
          replayHash: actionReceipt.combatReadout?.replayHash ?? null,
          runtimeSessionHash: composedRuntime.runtimeSessionHash,
          registryDigest: composedRuntime.gameplay.gameplayRegistryDigest,
          reactionFrameHash: composedRuntime.gameplay.lastReactionFrameHash,
          decisionReceiptHash: composedRuntime.gameplay.lastDecisionReceiptHash,
          challengeState,
        },
      };
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

function runtimeCameraHandle(camera: any): number {
  if (typeof camera === 'number') {
    return camera;
  }
  const handle = camera?.handle ?? camera?.camera;
  if (!Number.isSafeInteger(handle) || handle < 0) {
    throw new RuntimeBridgeError(
      'invalid_input',
      'Primary fire requires an authoritative RuntimeSession camera handle.',
    );
  }
  return handle;
}

function readChallengeState(bridge: any, view: any, runtimeSessionHash: string): any {
  const snapshot = bridge.readGameplayModuleView({
    view,
    scope: { kind: 'session' },
    expectedRuntimeSessionHash: runtimeSessionHash,
  });
  return {
    ...JSON.parse(new TextDecoder().decode(Uint8Array.from(snapshot.canonicalPayload))),
    providerId: snapshot.providerId,
    revision: snapshot.revision,
    viewHash: snapshot.viewHash,
    runtimeSessionHash: snapshot.runtimeSessionHash,
  };
}

function readDamageApplied(combatReadout: any): number | null {
  const event = combatReadout?.events?.find((candidate: any) => candidate.kind === 'damage_applied');
  return event === undefined ? null : Number(event.amount);
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
