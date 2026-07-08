import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { installAshaDemoStandaloneProvider } from '../host/standalone-bootstrap.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(repoRoot, 'dist/ui');
const standaloneRoot = join(repoRoot, 'dist/standalone');
const shouldBuild = !process.argv.includes('--no-build');

if (shouldBuild) {
  runBuild();
}

const installation = installAshaDemoStandaloneProvider(globalThis);
const content = await loadContent();
const status = await readContentStatus(content);

if (!status.valid) {
  throw new Error(`Standalone host packaged invalid project content: ${status.diagnostics.join('; ')}`);
}

const runtimeBackend = await createRuntimeBackend(content);
if (!runtimeBackend.available || runtimeBackend.status !== 'rust_authority') {
  const diagnostic = runtimeBackend.diagnostics?.[0]?.message ?? runtimeBackend.status;
  throw new Error(`Standalone host failed closed before native RuntimeSession authority loaded: ${diagnostic}`);
}

const runtimeGateway = await createRuntimeGateway(runtimeBackend);
const readout = runtimeGateway.readEcrpRuntimeReadout();
if (readout?.entityCount !== 2) {
  throw new Error(`Standalone host expected 2 ECRP entities, saw ${readout?.entityCount ?? 'none'}`);
}

const fireReceipt = runtimeGateway.submitPrimaryFire({
  phase: 'pressed',
  camera: { pose: content.runtime.initialCameraPose },
  tick: 0,
  source: 'standalone_native_host_smoke',
  pressed: true,
  baseDamage: content.catalogs.weapon.damage,
  rangeMillimeters: content.catalogs.weapon.rangeUnits * 1000,
});
if (!fireReceipt?.accepted) {
  throw new Error('Standalone host native RuntimeSession rejected primary fire smoke.');
}

const telemetry = runtimeGateway.readTelemetry();
const summary = {
  kind: 'asha_demo.standalone_host_smoke.v1',
  hostMode: 'standalone_compiled',
  contentRoot: 'dist/ui',
  providerGlobal: installation.providerGlobal,
  providerContract: installation.profile.providerContract,
  referenceFallback: installation.profile.referenceFallback,
  projectBundle: status.sourceFiles.projectBundle,
  entityCount: readout.entityCount,
  gameRuleModule: content.gameRuleModules[0]?.moduleRef?.moduleId ?? null,
  runtimeStatus: runtimeBackend.status,
  primaryFireAccepted: fireReceipt.accepted,
  replayHash: fireReceipt.replayEvidence?.replayHash ?? null,
  telemetryReplayRecords: telemetry?.replayRecords?.length ?? 0,
};

mkdirSync(standaloneRoot, { recursive: true });
writeFileSync(join(standaloneRoot, 'status.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

function runBuild() {
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function loadContent() {
  const module = await import(pathToFileURL(join(appRoot, 'content/project-content.js')));
  return module.loadDemoProjectContent(readStandaloneJson);
}

async function readContentStatus(content) {
  const module = await import(pathToFileURL(join(appRoot, 'content/project-content.js')));
  return module.readDemoProjectContentStatus(content);
}

async function createRuntimeBackend(content) {
  const module = await import(pathToFileURL(join(appRoot, 'runtime/demo-runtime-gateway.js')));
  return module.createDemoRuntimeBackend(content);
}

async function createRuntimeGateway(runtimeBackend) {
  const module = await import(pathToFileURL(join(appRoot, 'runtime/demo-runtime-gateway.js')));
  return module.createDemoRuntimeGateway(runtimeBackend);
}

async function readStandaloneJson(requestPath) {
  const normalized = requestPath.replace(/^\/+/, '');
  const filePath = resolve(appRoot, normalized);
  if (!filePath.startsWith(appRoot)) {
    throw new Error(`Standalone host rejected content path outside app root: ${requestPath}`);
  }
  return JSON.parse(readFileSync(filePath, 'utf8'));
}
