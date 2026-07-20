import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiStatus } from './ui-status.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = readFileSync(join(repoRoot, 'app/index.html'), 'utf8');
const appTs = readFileSync(join(repoRoot, 'src/bootstrap/boot-game.ts'), 'utf8');
const entrypointTs = readFileSync(join(repoRoot, 'src/app.ts'), 'utf8');
const runtimeGatewayTs = readFileSync(join(repoRoot, 'src/runtime/demo-runtime-gateway.ts'), 'utf8');
const projectBundle = readJson('asha.project-bundle.json');
const entryScene = projectBundle.scenes.find((scene) => scene.id === projectBundle.entryScene);
const sceneDocument = readJson(entryScene.artifact);
const styles = readFileSync(join(repoRoot, 'app/styles.css'), 'utf8');
const status = buildUiStatus(repoRoot);
const errors = [];

requireText(indexHtml, 'asha-renderer-browser-surface');
requireText(indexHtml, '@asha/renderer-host');
requireText(indexHtml, '"three/": "/vendor/asha-renderer-host/vendor/three/"');
requireText(entrypointTs, 'bootGame');
requireText(appTs, 'mountAshaRendererAnimatedMeshSurface');
requireText(appTs, 'hudControlToIntent');
requireText(appTs, 'loadDemoProjectContent');
requireText(appTs, 'generated-tunnel-enemy');
requireText(runtimeGatewayTs, 'createRuntimeSessionFacade');
requireText(runtimeGatewayTs, 'createDemoRuntimeGateway');
requireText(runtimeGatewayTs, 'readAnimationIntent');
requireText(runtimeGatewayTs, 'session.loadProject');
requireText(runtimeGatewayTs, 'readActiveRuntimeProjectContent');
requireText(styles, '#asha-render-surface');
requireProjectFile('asha.project-bundle.json');
for (const artifact of projectBundle.artifacts) requireProjectFile(artifact.path);

if (sceneDocument.schemaVersion !== 4 || !Array.isArray(sceneDocument.nodes)) {
  errors.push('the Demo product scene must be a canonical schema-v4 FlatSceneDocument');
}
for (const forbidden of ['loadEcrpProject', 'requestGeneratedTunnelOperation']) {
  if (runtimeGatewayTs.includes(forbidden)) {
    errors.push(`Demo runtime gateway must not use removed manual bootstrap operation ${forbidden}`);
  }
}

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
