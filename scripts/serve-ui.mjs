import {
  describeNativeBrowserHostCommand,
  launchNativeBrowserHost,
} from '@asha/browser-host';
import { createNativeRuntimeBridge } from '@asha/runtime-bridge';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'dist/ui');
const args = parseArgs(process.argv.slice(2));
const host = args.host ?? process.env.HOST ?? process.env.npm_config_host;
const port = readPort(args.port ?? process.env.PORT ?? process.env.npm_config_port);

runStaticUiBuild();
const nativeProviderPath = join(repoRoot, 'dist/native/asha-demo-runtime-provider.node');

const nativeHost = await launchNativeBrowserHost({
  uiRoot: appRoot,
  healthProject: 'asha-demo',
  ...(host !== undefined ? { host } : {}),
  ...(port !== undefined ? { port } : {}),
  provider: {
    createRuntimeBridge: () => createNativeRuntimeBridge(nativeProviderPath),
  },
});

console.log(`asha-demo native browser host listening at ${nativeHost.url}`);
console.log(JSON.stringify({
  kind: nativeHost.kind,
  compatibilityVersion: nativeHost.compatibilityVersion,
  command: describeNativeBrowserHostCommand(),
  provider: nativeHost.provider,
}, null, 2));

process.on('SIGTERM', () => void closeAndExit());
process.on('SIGINT', () => void closeAndExit());

async function closeAndExit() {
  await nativeHost.close();
  process.exit(0);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--host') {
      parsed.host = readFlagValue(argv, index, arg);
      index += 1;
    } else if (arg === '--port') {
      parsed.port = readFlagValue(argv, index, arg);
      index += 1;
    }
  }
  return parsed;
}

function readFlagValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function readPort(value) {
  if (value === undefined) {
    return undefined;
  }
  const portValue = Number(value);
  if (!Number.isSafeInteger(portValue) || portValue < 0 || portValue > 65535) {
    throw new Error('Port must be an integer from 0 to 65535.');
  }
  return portValue;
}

function runStaticUiBuild() {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
