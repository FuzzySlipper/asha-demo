import {
  cameraHandle,
  type FlatSceneDocument,
  type GameplayContractRef,
  type InputActionPhase,
} from '@asha/contracts';
import {
  RuntimeBridgeError,
  assertNativeRustRuntimeBridgeAuthority,
  createDefaultBrowserInputCatalog,
  createRuntimeSessionFacade,
  readRuntimeSessionPlayableEncounterTick,
  readRuntimeSessionPlayableLoopState,
  resolveNativeRustRuntimeBridgeProvider,
  type NativeRustRuntimeBridgeProviderProfile,
  type RuntimeBridge,
  type RuntimeSessionPlayableEncounterTickReadout,
  type RuntimeSessionPlayableEncounterTickRequest,
  type RuntimeSessionPlayableLoopState,
  type RuntimeSessionPlayableLoopStateRequest,
} from '@asha/runtime-bridge';
import type {
  CombatRuntimeReadout,
  ComposedGameplayReadout,
  ComposedRuntimeSessionReadout,
  GameplayModuleViewSnapshot,
  GameplayPrefabPartInteractionReceipt,
  RuntimeActionIntentPhase,
  RuntimeActionIntentSource,
  RuntimeSessionActionIntentReceipt,
  RuntimeSessionEcrpProjectDiagnostic,
  RuntimeSessionEcrpProjectLoadReceipt,
  RuntimeSessionFacade,
  RuntimeSessionGeneratedTunnelOperationReceipt,
} from '@asha/runtime-session';
import {
  readSceneBootstrapBindings,
  type DemoProjectContent,
} from '../content/project-content.js';

export interface DemoRuntimeDiagnostic {
  readonly code: string;
  readonly severity: 'error';
  readonly message: string;
}

export interface DemoGameplayChallengeState {
  readonly revision: number;
  readonly status: string;
  readonly triggerEntries: number;
  readonly closeRangeHits: number;
  readonly score: number;
  readonly objectivePoints: number;
  readonly closeRangeMillimeters: number;
  readonly closeRangeBonus: number;
  readonly lastRangeMillimeters: number | null;
  readonly providerId: string;
  readonly viewRevision: number;
  readonly viewHash: string;
  readonly runtimeSessionHash: string;
}

export type DemoRuntimeBackend = DemoAvailableRuntimeBackend | DemoUnavailableRuntimeBackend;

export interface DemoAvailableRuntimeBackend {
  readonly available: true;
  readonly status: 'rust_authority';
  readonly session: RuntimeSessionFacade;
  readonly loadReceipt: RuntimeSessionEcrpProjectLoadReceipt;
  readonly sceneDocument: FlatSceneDocument;
  readonly sceneDocumentCanonicalJson: string;
  readonly sceneDocumentContentHash: string;
  readonly generatedTunnelOperation: RuntimeSessionGeneratedTunnelOperationReceipt;
  readonly bridge: RuntimeBridge;
  readonly composedRuntimeReadout: ComposedRuntimeSessionReadout;
  readonly prefabInteractionReceipt: GameplayPrefabPartInteractionReceipt;
  readonly challengeView: DemoGameplayChallengeState;
  readonly challengeViewContract: GameplayContractRef;
  readonly diagnostics: readonly [];
  readonly profile: NativeRustRuntimeBridgeProviderProfile;
  readonly backendHash: string;
}

export interface DemoUnavailableRuntimeBackend {
  readonly available: false;
  readonly status: 'missing_rust_backend' | 'rust_backend_failed';
  readonly session: null;
  readonly loadReceipt: RuntimeSessionEcrpProjectLoadReceipt;
  readonly sceneDocument: null;
  readonly sceneDocumentCanonicalJson: null;
  readonly sceneDocumentContentHash: null;
  readonly generatedTunnelOperation: null;
  readonly bridge: null;
  readonly composedRuntimeReadout: null;
  readonly prefabInteractionReceipt: null;
  readonly challengeView: null;
  readonly challengeViewContract: null;
  readonly diagnostics: readonly DemoRuntimeDiagnostic[];
  readonly profile: NativeRustRuntimeBridgeProviderProfile;
  readonly backendHash: string;
}

export interface DemoPrimaryFireInput {
  readonly phase: InputActionPhase;
  readonly camera: number | {
    readonly handle?: number;
    readonly camera?: number;
  };
  readonly tick: number;
  readonly source: RuntimeActionIntentSource;
  readonly pressed: boolean;
}

export interface DemoGameplayTransformEvidence {
  readonly moduleId: 'demo.primary-fire-effect';
  readonly status: 'accepted' | 'rejected';
  readonly damageApplied: number | null;
  readonly workspaceTrace: readonly string[];
  readonly replayHash: string | null;
  readonly runtimeSessionHash: string;
  readonly registryDigest: string;
  readonly reactionFrameHash: string | null;
  readonly decisionReceiptHash: string | null;
  readonly challengeState: DemoGameplayChallengeState;
}

export type DemoPrimaryFireReceipt = RuntimeSessionActionIntentReceipt & {
  readonly gameplayTransform: DemoGameplayTransformEvidence;
};

export interface DemoRuntimeGateway {
  available(): boolean;
  applyCollisionConstrainedCameraInput(
    input: Parameters<RuntimeSessionFacade['applyCollisionConstrainedCameraInput']>[0],
  ): ReturnType<RuntimeSessionFacade['applyCollisionConstrainedCameraInput']> | null;
  createCamera(
    input: Parameters<RuntimeSessionFacade['createCamera']>[0],
  ): ReturnType<RuntimeSessionFacade['createCamera']> | null;
  inputSession(): RuntimeSessionFacade | null;
  readInputContextState(): ReturnType<RuntimeSessionFacade['readInputContextState']> | null;
  readTimeControlState(): ReturnType<RuntimeSessionFacade['readTimeControlState']> | null;
  readEcrpRuntimeReadout(): ReturnType<RuntimeSessionFacade['readEcrpRuntimeReadout']> | null;
  readAnimationIntent(): ReturnType<RuntimeSessionFacade['readAnimationIntent']> | null;
  readLifecycleStatus(): ReturnType<RuntimeSessionFacade['readLifecycleStatus']> | null;
  readPlayableLoopState(
    shell: NonNullable<RuntimeSessionPlayableLoopStateRequest['shell']>,
  ): RuntimeSessionPlayableLoopState | null;
  readPlayableEncounterTick(
    input: RuntimeSessionPlayableEncounterTickRequest,
  ): RuntimeSessionPlayableEncounterTickReadout | null;
  readTelemetry(): ReturnType<RuntimeSessionFacade['readTelemetry']> | null;
  readProjection(): ReturnType<RuntimeSessionFacade['readProjection']> | null;
  readGameplayRuntime(): ComposedGameplayReadout | null;
  readComposedRuntimeSession(): ComposedRuntimeSessionReadout | null;
  readGameplayChallengeState(): DemoGameplayChallengeState | null;
  requestSessionRestart(
    input: Parameters<RuntimeSessionFacade['requestSessionRestart']>[0],
  ): ReturnType<RuntimeSessionFacade['requestSessionRestart']> | null;
  submitPrimaryFire(input: DemoPrimaryFireInput): DemoPrimaryFireReceipt | null;
}

export interface DemoInputReplaySession {
  readonly session: RuntimeSessionFacade;
  readonly gateway: DemoRuntimeGateway;
}

export async function createDemoRuntimeBackend(
  content: DemoProjectContent,
): Promise<DemoRuntimeBackend> {
  try {
    const providerResolution = await resolveNativeRustRuntimeBridgeProvider({
      providerGlobalNames: ['ashaRuntimeBridge'],
    });
    const profile = providerResolution.profile;
    if (providerResolution.status !== 'available') {
      const diagnostic = providerResolution.diagnostics[0] ?? {
        code: 'missing_rust_runtime_backend',
        severity: 'error',
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
    const sceneCodec = session.decodeSceneDocument({
      sourceText: content.sceneDocumentSourceText,
    });
    if (
      !sceneCodec.accepted
      || sceneCodec.document === null
      || sceneCodec.canonicalJson === null
      || sceneCodec.contentHash === null
    ) {
      return unavailableRuntimeBackend(
        profile,
        'rust_scene_document_rejected',
        `Rust rejected the committed Demo SceneDocument: ${formatSceneCodecDiagnostics(sceneCodec.diagnostics)}`,
        null,
        'rust_backend_failed',
      );
    }
    const sceneDocument = sceneCodec.document;
    const loadReceipt = session.loadEcrpProject({
      kind: 'runtime_session.load_ecrp_project.v0',
      projectBundle: content.projectBundle,
      entityDefinitions: content.entityDefinitions,
      sceneDocument,
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
    const generatorBinding = readSceneBootstrapBindings(sceneDocument)?.generator ?? null;
    if (generatorBinding === null) {
      return unavailableRuntimeBackend(
        profile,
        'missing_scene_generator_binding',
        'The canonical Demo SceneDocument does not declare its generated-tunnel bootstrap input.',
        loadReceipt,
        'rust_backend_failed',
      );
    }
    if (
      generatorBinding.providerId !== 'asha.generated-tunnel'
      || generatorBinding.presetId !== content.catalogs.levelPreset.presetId
      || generatorBinding.seed !== content.catalogs.levelPreset.seed
    ) {
      return unavailableRuntimeBackend(
        profile,
        'scene_generator_binding_mismatch',
        'The canonical scene generator binding does not match the selected Demo level preset.',
        loadReceipt,
        'rust_backend_failed',
      );
    }
    const generatedTunnelOperation = session.requestGeneratedTunnelOperation({
      operation: 'apply_to_runtime_world',
      presetId: generatorBinding.presetId,
      seed: generatorBinding.seed,
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
    const compositionRequirement = content.projectBundle.gameplayRuntime.compositionRequirement;
    const explicitCompositionMismatch = compositionRequirement !== undefined
      && composedBeforeInteraction.gameplay.semanticCompatibilityDigest
        !== compositionRequirement.semanticCompatibilityDigest;
    const legacyCompositionWasNotMigrated = compositionRequirement === undefined
      && (
        composedBeforeInteraction.gameplay.compositionLoadMode !== 'compatible'
        || !composedBeforeInteraction.gameplay.compatibilityDiagnostics.some(
          diagnostic => diagnostic.code === 'legacyCompatibilityDefaulted',
        )
      );
    if (explicitCompositionMismatch || legacyCompositionWasNotMigrated) {
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
      sceneDocument,
      sceneDocumentCanonicalJson: sceneCodec.canonicalJson,
      sceneDocumentContentHash: sceneCodec.contentHash,
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
        providerGlobal: 'globalThis.ashaRuntimeBridge',
        providerContract: 'asha.runtime_bridge.native_rust_provider.v1',
        requiredBackend: 'native_rust',
        productAuthority: true,
        referenceFallback: false,
      },
      diagnostic.code,
      diagnostic.message,
    );
  }
}

export function createDemoRuntimeGateway(runtimeBackend: DemoRuntimeBackend): DemoRuntimeGateway {
  const session = runtimeBackend.session;
  const bridge = runtimeBackend.bridge;
  return {
    available() {
      return session !== null;
    },
    applyCollisionConstrainedCameraInput(input) {
      return session?.applyCollisionConstrainedCameraInput(input) ?? null;
    },
    createCamera(input) {
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
    readPlayableLoopState(shell) {
      return session === null ? null : readRuntimeSessionPlayableLoopState(session, { shell });
    },
    readPlayableEncounterTick(input) {
      return session === null ? null : readRuntimeSessionPlayableEncounterTick(session, input);
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
      if (bridge === null || runtimeBackend.challengeViewContract === null) {
        return null;
      }
      const composed = bridge.readComposedRuntimeSession();
      return readChallengeState(
        bridge,
        runtimeBackend.challengeViewContract,
        composed.runtimeSessionHash,
      );
    },
    requestSessionRestart(input) {
      return session?.requestSessionRestart(input) ?? null;
    },
    submitPrimaryFire(input) {
      if (session === null || bridge === null || runtimeBackend.challengeViewContract === null) {
        return null;
      }
      const actionReceipt = session.submitRuntimeActionIntent({
        kind: 'runtime_action_intent.v0',
        action: 'primary_fire',
        phase: runtimeActionPhase(input.phase),
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
          workspaceTrace: actionReceipt.combatReadout?.authority.workspaceTrace ?? [],
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

export async function createDemoInputReplaySession(
  content: DemoProjectContent,
): Promise<DemoInputReplaySession> {
  const replayContent: DemoProjectContent = {
    ...content,
    runtime: {
      ...content.runtime,
      sessionId: `${content.runtime.sessionId}.input-replay`,
    },
  };
  const runtimeBackend = await createDemoRuntimeBackend(replayContent);
  if (!runtimeBackend.available) {
    throw new RuntimeBridgeError(
      'native_unavailable',
      runtimeBackend.diagnostics[0]?.message
        ?? 'ASHA input replay requires a fresh fully loaded native Rust RuntimeSession.',
    );
  }

  runtimeBackend.session.configureInputSession({
    catalog: createDefaultBrowserInputCatalog(),
    initialContexts: ['gameplay'],
  });
  return {
    session: runtimeBackend.session,
    gateway: createDemoRuntimeGateway(runtimeBackend),
  };
}

function runtimeCameraHandle(camera: DemoPrimaryFireInput['camera']): ReturnType<typeof cameraHandle> {
  if (typeof camera === 'number') {
    return cameraHandle(requireCameraHandle(camera));
  }
  const handle = camera.handle ?? camera.camera;
  return cameraHandle(requireCameraHandle(handle));
}

function requireCameraHandle(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RuntimeBridgeError(
      'invalid_input',
      'Primary fire requires an authoritative RuntimeSession camera handle.',
    );
  }
  return value;
}

function readChallengeState(
  bridge: RuntimeBridge,
  view: GameplayContractRef,
  runtimeSessionHash: string,
): DemoGameplayChallengeState {
  const snapshot = bridge.readGameplayModuleView({
    view,
    scope: { kind: 'session' },
    expectedRuntimeSessionHash: runtimeSessionHash,
  });
  const payloadText = new TextDecoder().decode(Uint8Array.from(snapshot.canonicalPayload));
  const payload: unknown = JSON.parse(payloadText);
  return decodeChallengeStatePayload(payload, snapshot);
}

function decodeChallengeStatePayload(
  value: unknown,
  snapshot: GameplayModuleViewSnapshot,
): DemoGameplayChallengeState {
  const payload = sourceObject(value, 'challengeState');
  const lastRange = payload['lastRangeMillimeters'];
  return {
    revision: nonNegativeInteger(payload['revision'], 'challengeState.revision'),
    status: nonEmptyString(payload['status'], 'challengeState.status'),
    triggerEntries: nonNegativeInteger(payload['triggerEntries'], 'challengeState.triggerEntries'),
    closeRangeHits: nonNegativeInteger(payload['closeRangeHits'], 'challengeState.closeRangeHits'),
    score: nonNegativeInteger(payload['score'], 'challengeState.score'),
    objectivePoints: nonNegativeInteger(payload['objectivePoints'], 'challengeState.objectivePoints'),
    closeRangeMillimeters: nonNegativeInteger(
      payload['closeRangeMillimeters'],
      'challengeState.closeRangeMillimeters',
    ),
    closeRangeBonus: nonNegativeInteger(payload['closeRangeBonus'], 'challengeState.closeRangeBonus'),
    lastRangeMillimeters: lastRange === null
      ? null
      : nonNegativeInteger(lastRange, 'challengeState.lastRangeMillimeters'),
    providerId: snapshot.providerId,
    viewRevision: snapshot.revision,
    viewHash: snapshot.viewHash,
    runtimeSessionHash: snapshot.runtimeSessionHash,
  };
}

function readDamageApplied(combatReadout: CombatRuntimeReadout | null): number | null {
  const event = combatReadout?.events.find((candidate) => candidate.kind === 'damage_applied');
  return event?.kind === 'damage_applied' ? event.amount : null;
}

function unavailableRuntimeBackend(
  profile: NativeRustRuntimeBridgeProviderProfile,
  code: string,
  message: string,
  loadReceipt: RuntimeSessionEcrpProjectLoadReceipt | null = null,
  status: DemoUnavailableRuntimeBackend['status'] = 'missing_rust_backend',
): DemoUnavailableRuntimeBackend {
  return {
    available: false,
    status,
    session: null,
    loadReceipt: loadReceipt ?? {
      kind: 'runtime_session.ecrp_project_load_receipt.v0',
      sequenceId: 0,
      accepted: false,
      diagnostics: [{ code: 'missingProjectBundle', path: 'runtime.backend', detail: `${code}:${message}` }],
      entityCount: 0,
      bootstrapHash: null,
      sessionHashBefore: 'missing-rust-backend',
      sessionHashAfter: 'missing-rust-backend',
    },
    sceneDocument: null,
    sceneDocumentCanonicalJson: null,
    sceneDocumentContentHash: null,
    diagnostics: [{ code, severity: 'error', message }],
    generatedTunnelOperation: null,
    bridge: null,
    composedRuntimeReadout: null,
    prefabInteractionReceipt: null,
    challengeView: null,
    challengeViewContract: null,
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

function formatLoadDiagnostics(diagnostics: readonly RuntimeSessionEcrpProjectDiagnostic[]): string {
  return diagnostics.map((diagnostic) => `${diagnostic.code}:${diagnostic.path}`).join('; ');
}

function formatSceneCodecDiagnostics(
  diagnostics: readonly { readonly code: string; readonly message: string }[],
): string {
  return diagnostics.length === 0
    ? 'missing canonical scene document result'
    : diagnostics.map((diagnostic) => `${diagnostic.code}:${diagnostic.message}`).join('; ');
}

function sourceObject(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RuntimeBridgeError('invalid_input', `${path} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RuntimeBridgeError('invalid_input', `${path} must be a non-empty string`);
  }
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RuntimeBridgeError('invalid_input', `${path} must be a non-negative safe integer`);
  }
  return value;
}

function runtimeActionPhase(phase: InputActionPhase): RuntimeActionIntentPhase {
  if (phase === 'pressed' || phase === 'released') {
    return phase;
  }
  throw new RuntimeBridgeError('invalid_input', 'Primary fire does not accept a held input phase.');
}
