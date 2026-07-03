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

requireText(indexHtml, 'ASHA Demo');
requireText(indexHtml, 'Static ASHA Readout');
requireText(indexHtml, 'not a playable FPS');
requireText(appJs, '/api/status');
requireText(appJs, 'publicAshaReadout');
requireText(styles, '.status-board');
requireText(styles, '.snapshot-list');

if (status.playable !== false) {
  errors.push('UI status must keep playable=false');
}
if (status.runtimeSessionAttached !== true) {
  errors.push('UI status must expose the static RuntimeSession readout');
}
if (status.publicAshaReadout?.staticRoom?.fixtureName !== 'static-room') {
  errors.push('UI status must include the public static-room fixture readout');
}
if (status.publicAshaReadout?.staticRoom?.projectionHandleCount !== 7) {
  errors.push('UI status must include seven projected static-room handles');
}
if (!status.publicAshaReadout?.publicImports?.includes('@asha/renderer-three')) {
  errors.push('UI status must record @asha/renderer-three as a public import');
}
if (!status.nonClaims.some((claim) => claim.includes('Not a playable FPS'))) {
  errors.push('UI status must include the playable FPS non-claim');
}

if (errors.length > 0) {
  console.error('UI asset check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('ASHA demo UI asset check passed.');

function requireText(text, expected) {
  if (!text.includes(expected)) {
    errors.push(`missing required UI text: ${expected}`);
  }
}
