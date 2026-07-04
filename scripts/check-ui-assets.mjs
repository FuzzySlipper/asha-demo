import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUiStatus } from './ui-status.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = readFileSync(join(repoRoot, 'app/index.html'), 'utf8');
const appJs = readFileSync(join(repoRoot, 'app/app.js'), 'utf8');
const styles = readFileSync(join(repoRoot, 'app/styles.css'), 'utf8');
const status = buildUiStatus(repoRoot);
const errors = [];

requireText(indexHtml, 'asha-renderer-browser-surface');
requireText(indexHtml, '@asha/renderer-three');
requireText(indexHtml, 'three');
requireText(appJs, 'mountAshaRendererBrowserSurface');
requireText(styles, '#asha-render-surface');

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
