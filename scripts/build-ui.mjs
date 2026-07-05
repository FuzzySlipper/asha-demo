import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiStatus } from './ui-status.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(repoRoot, 'dist/ui');
const catalogCoreVendorRoot = join(outputRoot, 'vendor/asha-catalog-core');
const contractsVendorRoot = join(outputRoot, 'vendor/asha-contracts');
const renderProjectionVendorRoot = join(outputRoot, 'vendor/asha-render-projection');
const rendererThreeVendorRoot = join(outputRoot, 'vendor/asha-renderer-three');
const runtimeBridgeVendorRoot = join(outputRoot, 'vendor/asha-runtime-bridge');
const threeVendorRoot = join(outputRoot, 'vendor/three');

rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });
cpSync(join(repoRoot, 'app'), outputRoot, { recursive: true });
cpSync(join(repoRoot, 'catalogs'), join(outputRoot, 'catalogs'), { recursive: true });
cpSync(join(repoRoot, 'levels'), join(outputRoot, 'levels'), { recursive: true });
cpSync(join(repoRoot, 'project'), join(outputRoot, 'project'), { recursive: true });
mkdirSync(catalogCoreVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', '@asha', 'catalog-core', 'dist'), catalogCoreVendorRoot, { recursive: true });
mkdirSync(contractsVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', '@asha', 'contracts', 'dist'), contractsVendorRoot, { recursive: true });
mkdirSync(renderProjectionVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', '@asha', 'render-projection', 'dist'), renderProjectionVendorRoot, { recursive: true });
mkdirSync(rendererThreeVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', '@asha', 'renderer-three', 'dist'), rendererThreeVendorRoot, { recursive: true });
mkdirSync(runtimeBridgeVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', '@asha', 'runtime-bridge', 'dist'), runtimeBridgeVendorRoot, { recursive: true });
mkdirSync(threeVendorRoot, { recursive: true });
cpSync(join(repoRoot, 'node_modules', 'three'), threeVendorRoot, { recursive: true });
writeFileSync(join(outputRoot, 'status.json'), `${JSON.stringify(buildUiStatus(repoRoot), null, 2)}\n`);

console.log(`Built ASHA demo static UI at ${outputRoot}`);
