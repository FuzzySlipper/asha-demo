import {
  createNativeRuntimeBridge,
  installNativeRustRuntimeBridgeProvider,
} from '@asha/runtime-bridge';

export function installAshaDemoStandaloneProvider(globalScope = globalThis) {
  return installNativeRustRuntimeBridgeProvider({
    globalScope,
    createRuntimeBridge: () => createNativeRuntimeBridge(),
  });
}
