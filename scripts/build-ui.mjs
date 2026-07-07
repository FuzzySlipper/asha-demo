import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiStatus } from './ui-status.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ashaRendererThreeRoot = resolve(repoRoot, '../asha-engine/ts/packages/renderer-three');
const ashaRendererThreeRequire = createRequire(join(ashaRendererThreeRoot, 'package.json'));
const outputRoot = join(repoRoot, 'dist/ui');
const catalogCoreVendorRoot = join(outputRoot, 'vendor/asha-catalog-core');
const contractsVendorRoot = join(outputRoot, 'vendor/asha-contracts');
const renderProjectionVendorRoot = join(outputRoot, 'vendor/asha-render-projection');
const rendererHostVendorRoot = join(outputRoot, 'vendor/asha-renderer-host');
const rendererHostBackendVendorRoot = join(rendererHostVendorRoot, 'vendor/asha-renderer-three');
const rendererHostThreeVendorRoot = join(rendererHostVendorRoot, 'vendor/three');
const runtimeBridgeVendorRoot = join(outputRoot, 'vendor/asha-runtime-bridge');
const rendererHostBackendSourceRoot = join(ashaRendererThreeRoot, 'dist');
const rendererHostThreeSourceRoot = dirname(dirname(ashaRendererThreeRequire.resolve('three')));

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });
cpSync(join(repoRoot, 'app', 'index.html'), join(outputRoot, 'index.html'));
cpSync(join(repoRoot, 'app', 'styles.css'), join(outputRoot, 'styles.css'));
cpSync(join(repoRoot, 'catalogs'), join(outputRoot, 'catalogs'), { recursive: true });
cpSync(join(repoRoot, 'levels'), join(outputRoot, 'levels'), { recursive: true });
cpSync(join(repoRoot, 'project'), join(outputRoot, 'project'), { recursive: true });
runTypeScriptBuild();
mkdirSync(catalogCoreVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', '@asha', 'catalog-core', 'dist'), catalogCoreVendorRoot, { recursive: true });
mkdirSync(contractsVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', '@asha', 'contracts', 'dist'), contractsVendorRoot, { recursive: true });
mkdirSync(renderProjectionVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', '@asha', 'render-projection', 'dist'), renderProjectionVendorRoot, { recursive: true });
mkdirSync(rendererHostVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', '@asha', 'renderer-host', 'dist'), rendererHostVendorRoot, { recursive: true });
mkdirSync(rendererHostBackendVendorRoot, { recursive: true });
cpSync(rendererHostBackendSourceRoot, rendererHostBackendVendorRoot, { recursive: true });
mkdirSync(runtimeBridgeVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', '@asha', 'runtime-bridge', 'dist'), runtimeBridgeVendorRoot, { recursive: true });
mkdirSync(rendererHostThreeVendorRoot, { recursive: true });
cpSync(rendererHostThreeSourceRoot, rendererHostThreeVendorRoot, { recursive: true });
writeFileSync(join(outputRoot, 'status.json'), `${JSON.stringify(buildUiStatus(repoRoot), null, 2)}\n`);

console.log(`Built ASHA demo static UI at ${outputRoot}`);

function runTypeScriptBuild() {
  const result = spawnSync('npx', ['tsc', '-p', 'tsconfig.json'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
