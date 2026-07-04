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
requireText(indexHtml, 'Playable Loop');
requireText(indexHtml, 'public-asha-playable-loop');
requireText(indexHtml, 'HUD / Menu Overlay');
requireText(indexHtml, 'public-asha-hud-overlay');
requireText(indexHtml, 'First-Person Tunnel View');
requireText(indexHtml, 'public-asha-first-person-viewport');
requireText(indexHtml, '@asha/renderer-three');
requireText(indexHtml, '@asha/render-projection');
requireText(indexHtml, 'three');
requireText(indexHtml, 'Static ASHA Readout');
requireText(indexHtml, 'Movement / Collision');
requireText(indexHtml, 'Generated Tunnel');
requireText(indexHtml, 'Combat / HUD');
requireText(indexHtml, 'Fire Primary');
requireText(indexHtml, 'Run Enemy Tick');
requireText(indexHtml, 'Restart Loop');
requireText(indexHtml, 'Probe Wall Stop');
requireText(appJs, '/api/status');
requireText(appJs, 'publicAshaReadout');
requireText(appJs, 'BrowserFpsInputCollector');
requireText(appJs, 'applyCollisionConstrainedCameraInput');
requireText(appJs, 'submitRuntimeActionIntent');
requireText(appJs, 'runAutonomousPolicyTick');
requireText(appJs, 'readLifecycleStatus');
requireText(appJs, 'requestSessionRestart');
requireText(appJs, 'renderPlayableLoopReadout');
requireText(appJs, 'renderHudOverlayReadout');
requireText(appJs, 'renderFirstPersonTunnelViewport');
requireText(appJs, 'renderFirstPersonViewportReadout');
requireText(appJs, 'first_person_tunnel_viewport.v0');
requireText(appJs, 'handleHudControl');
requireText(appJs, 'hud_projection.v0');
requireText(appJs, 'renderCombatHudReadout');
requireText(appJs, 'renderGeneratedTunnelReadout');
requireText(styles, '.status-board');
requireText(styles, '.snapshot-list');
requireText(styles, '.movement-actions');
requireText(styles, '.loop-facts');
requireText(styles, '.hud-overlay');
requireText(styles, '.hud-controls');
requireText(styles, '.first-person-viewport');
requireText(styles, '.viewport-canvas');
requireText(styles, '.generated-facts');
requireText(styles, '.combat-facts');

if (status.playable !== true) {
  errors.push('UI status must expose playable=true for the integrated public RuntimeSession loop');
}
if (status.runtimeSessionAttached !== true) {
  errors.push('UI status must expose the public RuntimeSession readout');
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
if (status.publicAshaReadout?.playableLoop?.status !== 'public_runtime_session_playable_loop') {
  errors.push('UI status must include the integrated public RuntimeSession playable loop');
}
if (status.publicAshaReadout?.playableLoop?.autonomousTick?.kind !== 'runtime_session.autonomous_policy_tick.v0') {
  errors.push('UI status must include the public autonomous policy tick readout');
}
if (status.publicAshaReadout?.playableLoop?.autonomousTick?.proposalSummary?.acceptedProposalCount !== 1) {
  errors.push('UI status must include one accepted autonomous policy proposal');
}
if (status.publicAshaReadout?.playableLoop?.autonomousTick?.proposalSummary?.unsupportedProposalCount !== 1) {
  errors.push('UI status must include the unsupported enemy movement proposal count');
}
if (status.publicAshaReadout?.playableLoop?.autonomousTick?.movementSummary?.reason !== 'movement_authority_not_wired') {
  errors.push('UI status must expose movement_authority_not_wired from the runtime bridge');
}
if (status.publicAshaReadout?.playableLoop?.autonomousTick?.combatSummary?.status !== 'accepted') {
  errors.push('UI status must expose accepted combat from the autonomous policy tick');
}
if (status.publicAshaReadout?.playableLoop?.lifecycleAfterAutonomousTick?.outcome?.kind !== 'won') {
  errors.push('UI status must expose terminal lifecycle after autonomous policy combat');
}
if (status.publicAshaReadout?.playableLoop?.playerDefeatFixture?.outcome?.kind !== 'lost') {
  errors.push('UI status must expose deterministic player defeat lifecycle status');
}
if (status.publicAshaReadout?.playableLoop?.restartReceipt?.status !== 'accepted') {
  errors.push('UI status must expose accepted typed restart receipt');
}
if (status.publicAshaReadout?.playableLoop?.restartReceipt?.statusAfter?.outcome?.kind !== 'in_progress') {
  errors.push('UI status must expose in-progress lifecycle after restart');
}
if (status.publicAshaReadout?.playableLoop?.firstPersonViewport?.summary?.kind !== 'first_person_tunnel_viewport.v0') {
  errors.push('UI status must include the public first-person tunnel viewport summary');
}
if (status.publicAshaReadout?.playableLoop?.firstPersonViewport?.summary?.debug?.outputHash !== 'a9b504096397f5b4') {
  errors.push('UI status must include the first-person viewport generated tunnel output hash');
}
if (status.publicAshaReadout?.playableLoop?.firstPersonViewport?.summary?.scene?.frameHash?.startsWith('fnv1a64:') !== true) {
  errors.push('UI status must include the first-person viewport frame hash');
}
if (status.publicAshaReadout?.playableLoop?.firstPersonViewport?.wallInstanceCount !== 3) {
  errors.push('UI status must expose generated tunnel wall instance count from renderer-three');
}
if (status.publicAshaReadout?.playableLoop?.hudOverlay?.projection?.kind !== 'hud_projection.v0') {
  errors.push('UI status must include the public HUD projection overlay');
}
if (status.publicAshaReadout?.playableLoop?.hudOverlay?.menuIntents?.restart?.kind !== 'runtime.restart_session_intent') {
  errors.push('UI status must include typed HUD restart intent');
}
if (status.publicAshaReadout?.playableLoop?.hudOverlay?.menuIntents?.options?.kind !== 'ui.open_options_intent') {
  errors.push('UI status must include typed HUD options placeholder intent');
}
if (status.publicAshaReadout?.playableLoop?.hudOverlay?.menuIntents?.exit?.kind !== 'ui.exit_to_menu_intent') {
  errors.push('UI status must include typed HUD exit placeholder intent');
}
if (!status.publicAshaReadout?.playableLoop?.hudOverlay?.unsupportedControls?.some(
  (control) => control.controlId === 'hud-options' && control.status === 'unsupported',
)) {
  errors.push('UI status must expose unsupported HUD options control status');
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
if (!status.nonClaims.some((claim) => claim.includes('movement_authority_not_wired'))) {
  errors.push('UI status must include the enemy movement authority non-claim');
}
if (!status.nonClaims.some((claim) => claim.includes('not a full native FPS'))) {
  errors.push('UI status must include the native FPS scope non-claim');
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
