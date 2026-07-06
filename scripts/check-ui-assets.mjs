import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiStatus } from './ui-status.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = readFileSync(join(repoRoot, 'app/index.html'), 'utf8');
const appJs = readFileSync(join(repoRoot, 'app/app.js'), 'utf8');
const projectBundle = readJson('project/project-bundle.json');
const styles = readFileSync(join(repoRoot, 'app/styles.css'), 'utf8');
const status = buildUiStatus(repoRoot);
const errors = [];

requireText(indexHtml, 'asha-renderer-browser-surface');
requireText(indexHtml, '@asha/renderer-three');
requireText(indexHtml, 'three');
requireText(appJs, 'mountAshaRendererBrowserSurface');
requireText(appJs, 'createAshaRendererGeneratedTunnelRoomSurfaceFrame');
requireText(appJs, 'hudControlToIntent');
requireText(appJs, 'loadDemoProjectContent');
requireText(appJs, 'readGeneratedTunnelReadout');
requireText(appJs, 'generated-tunnel-enemy');
requireText(styles, '#asha-render-surface');
requireProjectFile('project/project-bundle.json');
requireProjectFile(projectBundle.sourceFiles.sceneDocument);
for (const path of projectBundle.sourceFiles.entityDefinitions) {
  requireProjectFile(path);
}
for (const path of Object.values(projectBundle.sourceFiles.catalogRefs)) {
  requireProjectFile(path);
}
requireProjectFile(projectBundle.sourceFiles.levelPreset);
requireProjectFile('docs/demo-surface-audit.md');

if (appJs.includes("from 'three'") || appJs.includes('from "three"')) {
  errors.push('asha-demo must not import Three.js directly; rendering is owned by @asha/renderer-three');
}

if (status.playable !== true) {
  errors.push('UI status must expose playable=true for the renderer surface');
}
if (status.rendererSurface?.kind !== 'asha_renderer_browser_surface.v0') {
  errors.push('UI status must identify the ASHA renderer browser surface');
}
if (!status.rendererSurface?.publicImports?.includes('@asha/renderer-three')) {
  errors.push('UI status must record @asha/renderer-three as the public rendering import');
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
