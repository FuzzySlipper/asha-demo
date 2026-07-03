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
requireText(indexHtml, 'Movement / Collision');
requireText(indexHtml, 'Generated Tunnel');
requireText(indexHtml, 'Combat / HUD');
requireText(indexHtml, 'Fire Static Target');
requireText(indexHtml, 'Probe Wall Stop');
requireText(indexHtml, 'not a playable FPS');
requireText(appJs, '/api/status');
requireText(appJs, 'publicAshaReadout');
requireText(appJs, 'BrowserFpsInputCollector');
requireText(appJs, 'applyCollisionConstrainedCameraInput');
requireText(appJs, 'submitRuntimeActionIntent');
requireText(appJs, 'renderCombatHudReadout');
requireText(appJs, 'renderGeneratedTunnelReadout');
requireText(styles, '.status-board');
requireText(styles, '.snapshot-list');
requireText(styles, '.movement-actions');
requireText(styles, '.generated-facts');
requireText(styles, '.combat-facts');

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
if (status.publicAshaReadout?.movementReadout?.collision?.collided !== true) {
  errors.push('UI status must include public RuntimeSession wall-stop collision evidence');
}
if (status.publicAshaReadout?.generatedTunnel?.readout?.generator?.seed !== 17) {
  errors.push('UI status must include deterministic generated tunnel seed 17');
}
if (status.publicAshaReadout?.generatedTunnel?.readout?.generator?.outputHash !== 'a9b504096397f5b4') {
  errors.push('UI status must include the generated tunnel output hash');
}
if (status.publicAshaReadout?.generatedTunnel?.regenerate?.status !== 'unsupported') {
  errors.push('UI status must expose the typed fail-closed regenerate status');
}
if (!status.publicAshaReadout?.publicImports?.includes('@asha/ui-dom')) {
  errors.push('UI status must record @asha/ui-dom as a public import');
}
if (status.publicAshaReadout?.combatHud?.combatReadout?.outcome?.kind !== 'hit') {
  errors.push('UI status must include the public combat hit readout');
}
if (status.publicAshaReadout?.combatHud?.hudProjection?.health?.dead !== true) {
  errors.push('UI status must include defeated health HUD projection');
}
if (status.publicAshaReadout?.combatHud?.menuIntents?.restart?.kind !== 'runtime.restart_session_intent') {
  errors.push('UI status must include the typed HUD restart intent');
}
if (!status.publicAshaReadout?.publicImports?.includes('@asha/renderer-three')) {
  errors.push('UI status must record @asha/renderer-three as a public import');
}
if (!status.publicAshaReadout?.publicImports?.includes('@asha/runtime-bridge')) {
  errors.push('UI status must record @asha/runtime-bridge as a public import');
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
