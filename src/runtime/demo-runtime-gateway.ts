import {
  cameraHandle,
  type CameraCollisionPolicy,
  type FlatSceneDocument,
  type GameplayContractRef,
  type PerspectiveProjection,
  type ProjectConfigurationValue,
  type InputActionPhase,
  type ProjectContentDocument,
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
  RuntimeActionIntentPhase,
  RuntimeActionIntentSource,
  RuntimeSessionActionIntentReceipt,
  RuntimeSessionFacade,
  RuntimeSessionProjectLoadReceipt,
} from '@asha/runtime-session';
import type { DemoProjectContent } from '../content/project-content.js';

const DEMO_CHALLENGE_VIEW: GameplayContractRef = {
  namespace: 'demo.primary-fire-effect',
  name: 'challenge-state-view',
  version: 1,
  schemaHash: 'fnv1a64:2dc6de6c7c6ee80d',
};
const DEMO_LAUNCH_CONFIGURATION_ID = 'demo.launch-settings.default';

export interface DemoAcceptedLaunchSettings {
  readonly playerEntityDefinition: string;
  readonly cameraProjection: PerspectiveProjection;
  readonly movementMode: 'grounded' | 'freeFlight';
  readonly collisionShape: {
    readonly halfExtents: readonly [number, number, number];
  };
  readonly collisionPolicy: CameraCollisionPolicy;
}

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

export interface DemoStoredEnvironment {
  readonly status: 'loaded';
  readonly assetId: string;
  readonly grid: number;
}

export interface DemoAvailableRuntimeBackend {
  readonly available: true;
  readonly status: 'rust_authority';
  readonly session: RuntimeSessionFacade;
  readonly loadReceipt: RuntimeSessionProjectLoadReceipt;
  readonly sceneDocument: FlatSceneDocument;
  readonly projectDocuments: readonly ProjectContentDocument[];
  readonly launchSettings: DemoAcceptedLaunchSettings;
  readonly storedEnvironment: DemoStoredEnvironment;
  readonly bridge: RuntimeBridge;
  readonly composedRuntimeReadout: ComposedRuntimeSessionReadout;
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
  readonly loadReceipt: RuntimeSessionProjectLoadReceipt;
  readonly sceneDocument: null;
  readonly projectDocuments: readonly [];
  readonly launchSettings: null;
  readonly storedEnvironment: null;
  readonly bridge: null;
  readonly composedRuntimeReadout: null;
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
      project: {
        gameId: 'asha-demo',
        workspaceId: 'workspace.local',
      },
    });
    const loadReceipt = await session.loadProject({ source: content.projectSource });

    if (!loadReceipt.accepted || loadReceipt.activeProject === null) {
      return unavailableRuntimeBackend(
        profile,
        'rust_runtime_rejected_project',
        `Rust RuntimeSession rejected the canonical Demo project: ${formatLoadDiagnostics(loadReceipt.diagnostics)}`,
        loadReceipt,
        'rust_backend_failed',
      );
    }
    const activeContent = bridge.readActiveRuntimeProjectContent();
    const launchSettings = readAcceptedLaunchSettings(activeContent.content.documents);
    const storedBinding = loadReceipt.activeProject.voxelBindings[0] ?? null;
    if (storedBinding === null) {
      return unavailableRuntimeBackend(
        profile,
        'missing_stored_environment',
        'The canonical Demo project did not activate its stored voxel environment.',
        loadReceipt,
        'rust_backend_failed',
      );
    }
    const composedRuntimeReadout = bridge.readComposedRuntimeSession();
    const challengeView = readChallengeState(
      bridge,
      DEMO_CHALLENGE_VIEW,
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
      sceneDocument: activeContent.entryScene,
      projectDocuments: activeContent.content.documents,
      launchSettings,
      storedEnvironment: {
        status: 'loaded',
        assetId: storedBinding.assetId,
        grid: storedBinding.grid,
      },
      bridge,
      composedRuntimeReadout,
      challengeView,
      diagnostics: [],
      profile,
      backendHash: loadReceipt.activeProject.admissionHash,
      challengeViewContract: DEMO_CHALLENGE_VIEW,
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
  loadReceipt: RuntimeSessionProjectLoadReceipt | null = null,
  status: DemoUnavailableRuntimeBackend['status'] = 'missing_rust_backend',
): DemoUnavailableRuntimeBackend {
  return {
    available: false,
    status,
    session: null,
    loadReceipt: loadReceipt ?? {
      accepted: false,
      source: {
        kind: 'inMemory',
        identity: 'missing-rust-backend',
        materializationHash: 'missing-rust-backend',
      },
      activeProject: null,
      lifecycle: { generation: 0, revision: 0 },
      diagnostics: [{
        phase: 'lifecycle',
        code,
        documentId: null,
        path: null,
        message,
      }],
    },
    sceneDocument: null,
    projectDocuments: [],
    launchSettings: null,
    diagnostics: [{ code, severity: 'error', message }],
    storedEnvironment: null,
    bridge: null,
    composedRuntimeReadout: null,
    challengeView: null,
    challengeViewContract: null,
    profile,
    backendHash: `missing-rust-backend:${code}`,
  };
}

function readAcceptedLaunchSettings(
  documents: readonly ProjectContentDocument[],
): DemoAcceptedLaunchSettings {
  const gameplayDocument = documents.find(
    (document) => document.kind === 'gameplayConfiguration',
  );
  if (gameplayDocument?.kind !== 'gameplayConfiguration') {
    throw new RuntimeBridgeError(
      'invalid_input',
      'Rust-admitted Demo project content has no gameplay configuration document.',
    );
  }
  const configuration = gameplayDocument.document.configurations.find(
    (candidate) => candidate.configurationId === DEMO_LAUNCH_CONFIGURATION_ID,
  );
  if (configuration === undefined) {
    throw new RuntimeBridgeError(
      'invalid_input',
      `Rust-admitted Demo project content has no ${DEMO_LAUNCH_CONFIGURATION_ID} configuration.`,
    );
  }
  const values = new Map(
    configuration.values.map((field) => [field.fieldId, field.value] as const),
  );
  const fovYDegrees = launchNumber(values, 'fovYDegrees');
  const near = launchNumber(values, 'nearClip');
  const far = launchNumber(values, 'farClip');
  const groundedMovement = launchBoolean(values, 'groundedMovement');
  const playerEntityDefinition = launchEntrySceneFpsPlayerEntityDefinitionReference(
    values,
    'playerEntityDefinition',
  );
  return {
    playerEntityDefinition,
    cameraProjection: { fovYDegrees, near, far },
    movementMode: groundedMovement ? 'grounded' : 'freeFlight',
    collisionShape: {
      halfExtents: entityBoundsHalfExtents(documents, playerEntityDefinition),
    },
    collisionPolicy: {
      mode: 'axis_separable_slide',
      maxIterations: launchInteger(values, 'collisionMaxIterations'),
    },
  };
}

function entityBoundsHalfExtents(
  documents: readonly ProjectContentDocument[],
  stableId: string,
): readonly [number, number, number] {
  const entity = documents.find(
    (document) => document.kind === 'entityDefinition'
      && document.definition.stableId === stableId,
  );
  const bounds = entity?.kind === 'entityDefinition'
    ? entity.definition.capabilities.find((capability) => capability.kind === 'bounds')
    : undefined;
  if (bounds?.kind !== 'bounds') {
    throw new RuntimeBridgeError(
      'invalid_input',
      `Rust-admitted player entity definition ${stableId} has no bounds capability.`,
    );
  }
  const halfExtents = bounds.min.map(
    (minimum, axis) => (bounds.max[axis] - minimum) / 2,
  ) as [number, number, number];
  if (halfExtents.some((extent) => !Number.isFinite(extent) || extent <= 0)) {
    throw new RuntimeBridgeError(
      'invalid_input',
      `Rust-admitted player entity definition ${stableId} has unusable bounds.`,
    );
  }
  return halfExtents;
}

function launchValue(
  values: ReadonlyMap<string, ProjectConfigurationValue>,
  fieldId: string,
): ProjectConfigurationValue {
  const value = values.get(fieldId);
  if (value === undefined) {
    throw new RuntimeBridgeError(
      'invalid_input',
      `Rust-admitted ${DEMO_LAUNCH_CONFIGURATION_ID} is missing ${fieldId}.`,
    );
  }
  return value;
}

function launchNumber(
  values: ReadonlyMap<string, ProjectConfigurationValue>,
  fieldId: string,
): number {
  const value = launchValue(values, fieldId);
  if (value.kind !== 'number' || !Number.isFinite(value.value)) {
    throw new RuntimeBridgeError(
      'invalid_input',
      `Rust-admitted ${DEMO_LAUNCH_CONFIGURATION_ID}.${fieldId} is not a finite number.`,
    );
  }
  return value.value;
}

function launchInteger(
  values: ReadonlyMap<string, ProjectConfigurationValue>,
  fieldId: string,
): number {
  const value = launchValue(values, fieldId);
  if (value.kind !== 'integer' || !Number.isSafeInteger(value.value)) {
    throw new RuntimeBridgeError(
      'invalid_input',
      `Rust-admitted ${DEMO_LAUNCH_CONFIGURATION_ID}.${fieldId} is not an integer.`,
    );
  }
  return value.value;
}

function launchBoolean(
  values: ReadonlyMap<string, ProjectConfigurationValue>,
  fieldId: string,
): boolean {
  const value = launchValue(values, fieldId);
  if (value.kind !== 'boolean') {
    throw new RuntimeBridgeError(
      'invalid_input',
      `Rust-admitted ${DEMO_LAUNCH_CONFIGURATION_ID}.${fieldId} is not a boolean.`,
    );
  }
  return value.value;
}

function launchEntrySceneFpsPlayerEntityDefinitionReference(
  values: ReadonlyMap<string, ProjectConfigurationValue>,
  fieldId: string,
): string {
  const value = launchValue(values, fieldId);
  if (
    value.kind !== 'reference'
    || value.referenceKind !== 'entrySceneFpsPlayerEntityDefinition'
    || value.targetId.trim().length === 0
  ) {
    throw new RuntimeBridgeError(
      'invalid_input',
      `Rust-admitted ${DEMO_LAUNCH_CONFIGURATION_ID}.${fieldId} is not an entry-scene FPS player entity definition reference.`,
    );
  }
  return value.targetId;
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

function formatLoadDiagnostics(
  diagnostics: RuntimeSessionProjectLoadReceipt['diagnostics'],
): string {
  return diagnostics.length === 0
    ? 'project load returned no diagnostic'
    : diagnostics.map((diagnostic) => (
      `${diagnostic.phase}:${diagnostic.code}:${diagnostic.path ?? diagnostic.documentId ?? 'project'}:${diagnostic.message}`
    )).join('; ');
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
