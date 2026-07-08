import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiStatus } from './ui-status.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = readFileSync(join(repoRoot, 'app/index.html'), 'utf8');
const appTs = readFileSync(join(repoRoot, 'src/bootstrap/boot-game.ts'), 'utf8');
const entrypointTs = readFileSync(join(repoRoot, 'src/app.ts'), 'utf8');
const runtimeGatewayTs = readFileSync(join(repoRoot, 'src/runtime/demo-runtime-gateway.ts'), 'utf8');
const projectBundle = readJson('project/project-bundle.json');
const styles = readFileSync(join(repoRoot, 'app/styles.css'), 'utf8');
const status = buildUiStatus(repoRoot);
const errors = [];

requireText(indexHtml, 'asha-renderer-browser-surface');
requireText(indexHtml, '@asha/renderer-host');
requireText(entrypointTs, 'bootGame');
requireText(appTs, 'mountAshaRendererSurface');
requireText(appTs, 'createAshaRendererGeneratedTunnelRoomSurfaceFrame');
requireText(appTs, 'hudControlToIntent');
requireText(appTs, 'loadDemoProjectContent');
requireText(appTs, 'TINY_GENERATED_TUNNEL_READOUT');
requireText(appTs, 'generated-tunnel-enemy');
requireText(runtimeGatewayTs, 'createRuntimeSessionFacade');
requireText(runtimeGatewayTs, 'createDemoRuntimeGateway');
requireText(styles, '#asha-render-surface');
requireProjectFile('project/project-bundle.json');
requireProjectFile(projectBundle.sourceFiles.sceneDocument);
for (const path of projectBundle.sourceFiles.entityDefinitions) {
  requireProjectFile(path);
}
for (const path of Object.values(projectBundle.sourceFiles.catalogRefs)) {
  requireProjectFile(path);
}
for (const path of projectBundle.sourceFiles.gameRuleModules ?? []) {
  requireProjectFile(path);
}
requireProjectFile(projectBundle.sourceFiles.levelPreset);
requireProjectFile('docs/demo-surface-audit.md');

if (appTs.includes("from 'three'") || appTs.includes('from "three"')) {
  errors.push('asha-demo must not import Three.js directly; rendering is mounted through @asha/renderer-host');
}
if (appTs.includes('@asha/renderer-three')) {
  errors.push('asha-demo app code must import @asha/renderer-host rather than @asha/renderer-three');
}
if (indexHtml.includes('"@asha/renderer-three": "/vendor/asha-renderer-three/')) {
  errors.push('asha-demo must not expose @asha/renderer-three as a top-level import-map entry');
}
if (indexHtml.includes('"three": "/vendor/three/')) {
  errors.push('asha-demo must not expose bare Three.js as a top-level import-map entry');
}

if (status.playable !== true) {
  errors.push('UI status must expose playable=true for the renderer surface');
}
if (status.rendererSurface?.kind !== 'asha_renderer_surface.v0') {
  errors.push('UI status must identify the ASHA renderer host surface');
}
if (!status.rendererSurface?.publicImports?.includes('@asha/renderer-host')) {
  errors.push('UI status must record @asha/renderer-host as the public rendering import');
}
if (status.rendererSurface?.publicImports?.includes('@asha/renderer-three')) {
  errors.push('UI status must not present @asha/renderer-three as a public demo import');
}

if (errors.length > 0) {
  console.error('UI asset check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('ASHA demo renderer surface check passed.');

function requireText(text, expected) {
  if (!text.includes(expected)) {
    errors.push(`missing required UI text: ${expected}`);
  }
}

function requireProjectFile(relativePath) {
  if (!existsSync(join(repoRoot, relativePath))) {
    errors.push(`missing authored project file: ${relativePath}`);
  }
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8'));
}
