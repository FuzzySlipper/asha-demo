import {
  createNativeRuntimeBridge,
  installNativeRustRuntimeBridgeProvider,
} from '@asha/runtime-bridge';
import { createAshaDemoGameplayRuntime } from './gameplay-runtime-host.mjs';

export function installAshaDemoStandaloneProvider(globalScope = globalThis) {
  const gameplayRuntime = createAshaDemoGameplayRuntime();
  return installNativeRustRuntimeBridgeProvider({
    globalScope,
    createRuntimeBridge: () => gameplayRuntime.wrapRuntimeBridge(createNativeRuntimeBridge()),
    gameplayHost: gameplayRuntime.gameplayHost,
  });
}
