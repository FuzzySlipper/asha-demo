import {
  createNativeRuntimeBridge,
  installNativeRustRuntimeBridgeProvider,
} from '@asha/runtime-bridge';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nativeProviderPath = join(repoRoot, 'dist/native/asha-demo-runtime-provider.node');

export function installAshaDemoStandaloneProvider(globalScope = globalThis) {
  return installNativeRustRuntimeBridgeProvider({
    globalScope,
    createRuntimeBridge: () => createNativeRuntimeBridge(nativeProviderPath),
  });
}
