import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const browserHost = readJson('host/browser.host.json');
const standaloneHost = readJson('host/standalone.host.json');
const errors = [];

checkHost(browserHost, 'host/browser.host.json');
checkHost(standaloneHost, 'host/standalone.host.json');

if (browserHost.projectBundle !== standaloneHost.projectBundle) {
  errors.push('browser and standalone host configs must use the same ProjectBundle');
}
if (standaloneHost.launch?.portPolicy !== 'no_manual_dev_server_port') {
  errors.push('standalone host must not depend on a manually managed dev-server port');
}
if (JSON.stringify(browserHost.runtimeProvider) !== JSON.stringify(standaloneHost.runtimeProvider)) {
  errors.push('browser and standalone host configs must use the same runtime provider contract');
}
if (standaloneHost.status !== 'native_provider_host_smoke_ready') {
  errors.push('standalone host status must identify the native provider host smoke path');
}
if (standaloneHost.hostBootstrap !== 'host/standalone-bootstrap.mjs') {
  errors.push('standalone host must name the native provider bootstrap module');
}
if (standaloneHost.launch?.command !== 'npm run standalone') {
  errors.push('standalone host launch command must be npm run standalone');
}

if (errors.length > 0) {
  console.error('ASHA demo host parity check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('ASHA demo host parity check passed.');

function checkHost(host, label) {
  if (host.kind !== 'asha_demo.host_config.v1') {
    errors.push(`${label} kind must be asha_demo.host_config.v1`);
  }
  if (host.projectBundle !== 'project/project-bundle.json') {
    errors.push(`${label} must use project/project-bundle.json`);
  }
  if (host.runtimeProvider?.kind !== 'native_runtime_bridge_provider') {
    errors.push(`${label} must require native RuntimeBridge provider injection`);
  }
  if (host.runtimeProvider?.injection !== 'globalThis.ashaRuntimeBridge') {
    errors.push(`${label} must inject globalThis.ashaRuntimeBridge`);
  }
  if (host.runtimeProvider?.referenceFallback !== false) {
    errors.push(`${label} must fail closed instead of using reference fallback`);
  }
  if (host.renderSurface?.owner !== '@asha/renderer-host') {
    errors.push(`${label} must mount rendering through @asha/renderer-host`);
  }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8'));
}
