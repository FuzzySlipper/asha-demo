import {
  RuntimeBridgeError,
  assertNativeRustRuntimeBridgeAuthority,
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
      diagnostics: [],
      profile,
      backendHash: loadReceipt.bootstrapHash ?? 'rust-authority:loaded',
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
    readEcrpRuntimeReadout() {
      return session?.readEcrpRuntimeReadout() ?? null;
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
    requestSessionRestart(input: any) {
      return session?.requestSessionRestart(input) ?? null;
    },
    submitPrimaryFire(input: any) {
      return session?.submitRuntimeActionIntent({
        kind: 'runtime_action_intent.v0',
        action: 'primary_fire',
        ...input,
      }) ?? null;
    },
  };
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
