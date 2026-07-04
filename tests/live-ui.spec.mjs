import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

function brokerBaseUrl() {
  return process.env.PLAYWRIGHT_BROKER_BASE_URL ?? process.env.BASE_URL ?? null;
}

function artifactRoot() {
  return process.env.PLAYWRIGHT_BROKER_ARTIFACT_ROOT ?? 'artifacts/playwright-local';
}

test('@live-agent asha-demo drives the integrated public ASHA playable loop', async ({ page, request }) => {
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ASHA Demo' })).toBeVisible();
  await expect(page.getByText('Playable Loop:')).toBeVisible();

  const loop = page.locator('[data-demo-readout="public-asha-playable-loop"]');
  await expect(loop).toBeVisible();
  await expect(loop).toContainText('Public RuntimeSession');
  await expect(loop).toContainText('Generated tunnel');
  await expect(loop).toContainText('tiny-enclosed');
  await expect(loop).toContainText('a9b504096397f5b4');
  await expect(loop).toContainText('Enemy tick');
  await expect(loop).toContainText('not run');
  await expect(loop).toContainText('Player defeat fixture');
  await expect(loop).toContainText('lost');

  const encounter = page.locator('[data-demo-readout="public-asha-encounter-loop"]');
  await expect(encounter).toBeVisible();
  await expect(encounter).toContainText('Encounter Loop');
  await expect(encounter).toContainText('runtime_session.encounter_director.v0');
  await expect(encounter).toContainText('fps_gameplay_preset_readout.v0');
  await expect(encounter).toContainText('generated-tunnel-small-encounter');
  await expect(encounter).toContainText('pending');

  const viewport = page.locator('[data-demo-readout="public-asha-first-person-viewport"]');
  await expect(viewport).toBeVisible();
  await expect(viewport).toContainText('First-Person Tunnel View');
  await expect(viewport).toContainText('first_person_tunnel_viewport.v0');
  await expect(viewport).toContainText('generated-tunnel-first-person-viewport');
  await expect(viewport).toContainText('a9b504096397f5b4');
  await expect(viewport).toContainText('Frame hash');
  await expect(viewport).toContainText('Canvas pixel hash');
  const canvasStats = await page.locator('#first-person-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    if (context === null) {
      return { nonBlank: 0, width: canvas.width, height: canvas.height };
    }
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonBlank = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] !== 0 || data[index + 1] !== 0 || data[index + 2] !== 0) {
        nonBlank += 1;
      }
    }
    return { nonBlank, width: canvas.width, height: canvas.height };
  });
  expect(canvasStats.width).toBe(960);
  expect(canvasStats.height).toBe(360);
  expect(canvasStats.nonBlank).toBeGreaterThan(1000);

  const hud = page.locator('[data-demo-readout="public-asha-hud-overlay"]');
  await expect(hud).toBeVisible();
  await expect(hud).toContainText('HUD / Menu Overlay');
  await expect(hud).toContainText('hud_projection.v0');
  await expect(hud).toContainText('Player health');
  await expect(hud).toContainText('Health 100/100');
  await expect(hud).toContainText('Target health');
  await expect(hud).toContainText('Health 40/40');
  await expect(hud).toContainText('runtime.restart_session_intent');
  await expect(hud).toContainText('ui.open_options_intent');
  await expect(hud).toContainText('ui.exit_to_menu_intent');
  await expect(hud.getByRole('button', { name: 'Restart session' })).toBeVisible();
  await expect(hud.getByRole('button', { name: 'Options' })).toBeVisible();
  await expect(hud.getByRole('button', { name: 'Exit' })).toBeVisible();
  await hud.getByRole('button', { name: 'Restart session' }).click();
  await expect(hud).toContainText('session_not_terminal');

  await loop.getByRole('button', { name: 'Forward' }).click();
  await expect(loop).toContainText('Tick');
  await expect(loop).toContainText('Position');
  await loop.getByRole('button', { name: 'Look Right' }).click();
  await expect(loop).toContainText('Yaw / pitch');
  await expect(viewport).toContainText('Yaw / pitch');
  await loop.getByRole('button', { name: 'Probe Wall Stop' }).click();
  await expect(loop).toContainText('blocked z');
  await expect(viewport).toContainText('blocked z');
  await expect(loop).toContainText('fnv1a64:');
  await loop.getByRole('button', { name: 'Fire Primary' }).click();
  await expect(loop).toContainText('Enemy defeated');
  await expect(loop).toContainText('Health 0/40 defeated');
  await expect(hud).toContainText('Health 0/40 defeated');
  await hud.getByRole('button', { name: 'Restart session' }).click();
  await expect(loop).toContainText('accepted -> In progress');
  await expect(loop).toContainText('in_progress');
  await expect(hud).toContainText('Health 40/40');
  await hud.getByRole('button', { name: 'Options' }).click();
  await expect(hud).toContainText('ui.open_options_intent');
  await expect(hud).toContainText('unsupported');
  await expect(hud).toContainText('options_menu_not_implemented');
  await loop.getByRole('button', { name: 'Run Enemy Tick' }).click();
  await expect(loop).toContainText('runtime_session.autonomous_policy_tick.v0');
  await expect(loop).toContainText('1 accepted, 1 unsupported, 0 rejected');
  await expect(loop).toContainText('movement_authority_not_wired');
  await expect(loop).toContainText('e8e1ea7a09811ced');
  await expect(loop).toContainText('Enemy defeated');
  await loop.getByRole('button', { name: 'Run Encounter Loop' }).click();
  await expect(encounter).toContainText('1/1');
  await expect(encounter).toContainText('accepted -> active');
  await expect(encounter).toContainText('runtime_session.autonomous_policy_tick.v0');
  await expect(encounter).toContainText('combat_feedback_projection.v0');
  await expect(encounter).toContainText('Entity 20 defeated');
  await expect(encounter).toContainText('cleared · 1 defeated');
  await expect(encounter).toContainText('accepted -> In progress');
  await expect(encounter).toContainText('runtime_encounter.reset.v0');

  const readout = page.locator('[data-demo-readout="public-asha-static-room"]');
  await expect(readout).toBeVisible();
  await expect(readout).toContainText('@asha/runtime-bridge');
  await expect(readout).toContainText('@asha/renderer-three');
  await expect(readout).toContainText('static-room');
  await expect(readout).toContainText('Projected handles');
  await expect(readout).toContainText('7');
  await expect(readout).toContainText('wall stop available');

  const movement = page.locator('[data-demo-readout="public-asha-movement"]');
  await expect(movement).toBeVisible();
  await expect(movement).toContainText('Movement / Collision');
  await expect(movement).toContainText('Position');
  await expect(movement).toContainText('Yaw / pitch');

  const generatedTunnel = page.locator('[data-demo-readout="public-asha-generated-tunnel"]');
  await expect(generatedTunnel).toBeVisible();
  await expect(generatedTunnel).toContainText('tiny-enclosed');
  await expect(generatedTunnel).toContainText('Seed');
  await expect(generatedTunnel).toContainText('17');
  await expect(generatedTunnel).toContainText('a9b504096397f5b4');
  await expect(generatedTunnel).toContainText('fnv1a64:0821a0c2aea17dff');
  await expect(generatedTunnel).toContainText('player_start');
  await expect(generatedTunnel).toContainText('exit_hint');
  await expect(generatedTunnel).toContainText('unsupported');

  const combatHud = page.locator('[data-demo-readout="public-asha-combat-hud"]');
  await expect(combatHud).toBeVisible();
  await expect(combatHud).toContainText('Combat / HUD');
  await expect(combatHud).toContainText('Fire status');
  await expect(combatHud).toContainText('accepted');
  await expect(combatHud).toContainText('Health 0/40 defeated');
  await expect(combatHud).toContainText('runtime.restart_session_intent');
  await expect(combatHud).toContainText('Action');
  await expect(combatHud).toContainText('not fired');

  const enemyPolicy = page.locator('[data-demo-readout="public-asha-enemy-policy"]');
  await expect(enemyPolicy).toBeVisible();
  await expect(enemyPolicy).toContainText('Enemy Policy');
  await expect(enemyPolicy).toContainText('generated_tunnel_enemy_policy_fixture.v0');
  await expect(enemyPolicy).toContainText('read-only proposal-only');
  await expect(enemyPolicy).toContainText('enemy_policy.move_toward_target.v0');
  await expect(enemyPolicy).toContainText('enemy_policy.primary_fire_intent.v0');
  await expect(enemyPolicy).toContainText('e8e1ea7a09811ced');
  await expect(enemyPolicy).toContainText('Date');
  await expect(enemyPolicy).toContainText('Fire status');
  await expect(enemyPolicy).toContainText('accepted');
  await expect(enemyPolicy).toContainText('Health 0/40 defeated');
  await expect(enemyPolicy).toContainText('movement_authority_not_wired');

  const response = await request.get('/api/status');
  expect(response.ok()).toBe(true);
  const status = await response.json();
  expect(status.repo).toBe('asha-demo');
  expect(status.playable).toBe(true);
  expect(status.publicAshaReadout.publicImports).toEqual(expect.arrayContaining([
    '@asha/runtime-bridge',
    '@asha/renderer-three',
    '@asha/ui-dom',
    '@asha/catalog-core',
  ]));
  expect(status.publicAshaReadout.staticRoom.fixtureName).toBe('static-room');
  expect(status.publicAshaReadout.staticRoom.projectionHandleCount).toBe(7);
  expect(status.publicAshaReadout.staticRoom.rendererHandleCount).toBe(7);
  expect(status.publicAshaReadout.staticRoom.wallInstanceCount).toBe(4);
  expect(status.publicAshaReadout.movementReadout.collision.collided).toBe(true);
  expect(status.publicAshaReadout.movementReadout.collision.blockedAxes).toEqual(['z']);
  expect(status.publicAshaReadout.generatedTunnel.presetPath).toBe('levels/presets/tiny-enclosed-tunnel.json');
  expect(status.publicAshaReadout.generatedTunnel.readout.generator.seed).toBe(17);
  expect(status.publicAshaReadout.generatedTunnel.readout.generator.outputHash).toBe('a9b504096397f5b4');
  expect(status.publicAshaReadout.generatedTunnel.readout.replayHash).toBe('fnv1a64:0821a0c2aea17dff');
  expect(status.publicAshaReadout.generatedTunnel.regenerate.status).toBe('unsupported');
  expect(status.publicAshaReadout.gameplayPreset.kind).toBe('fps_gameplay_preset_readout.v0');
  expect(status.publicAshaReadout.gameplayPreset.preset.encounter.presetId).toBe('generated-tunnel-small-encounter');
  expect(status.publicAshaReadout.gameplayCatalog.kind).toBe('fps_gameplay_preset_catalog_readout.v0');
  expect(status.publicAshaReadout.gameplayCatalog.catalog.defaultPresetId).toBe('asha.generated_tunnel.default_fps.v0');
  expect(status.publicAshaReadout.playableLoop.status).toBe('public_runtime_session_playable_loop');
  expect(status.publicAshaReadout.playableLoop.generatedTunnel.outputHash).toBe('a9b504096397f5b4');
  expect(status.publicAshaReadout.playableLoop.encounterLoop.status).toBe('public_runtime_session_enemy_encounter_loop');
  expect(status.publicAshaReadout.playableLoop.encounterLoop.initialEncounter.kind).toBe('runtime_session.encounter_director.v0');
  expect(status.publicAshaReadout.playableLoop.encounterLoop.initialEncounter.state.pendingEnemyCount).toBe(1);
  expect(status.publicAshaReadout.playableLoop.encounterLoop.activationReceipt.status).toBe('accepted');
  expect(status.publicAshaReadout.playableLoop.encounterLoop.activationReceipt.after.state.activeEnemyCount).toBe(1);
  expect(status.publicAshaReadout.playableLoop.encounterLoop.combatFeedback.kind).toBe('combat_feedback_projection.v0');
  expect(status.publicAshaReadout.playableLoop.encounterLoop.combatFeedback.notifications.at(-1)?.eventKind).toBe('entity_defeated');
  expect(status.publicAshaReadout.playableLoop.encounterLoop.clearReceipt.after.state.status).toBe('cleared');
  expect(status.publicAshaReadout.playableLoop.encounterLoop.clearReceipt.after.state.defeatedEnemyCount).toBe(1);
  expect(status.publicAshaReadout.playableLoop.encounterLoop.lifecycleAfterEncounterSync.outcome.kind).toBe('won');
  expect(status.publicAshaReadout.playableLoop.encounterLoop.restartReceipt.statusAfter.outcome.kind).toBe('in_progress');
  expect(status.publicAshaReadout.playableLoop.encounterLoop.resetReceipt.after.state.status).toBe('pending');
  expect(status.publicAshaReadout.playableLoop.firstPersonViewport.summary.kind).toBe('first_person_tunnel_viewport.v0');
  expect(status.publicAshaReadout.playableLoop.firstPersonViewport.summary.fixture).toBe('generated-tunnel-first-person-viewport');
  expect(status.publicAshaReadout.playableLoop.firstPersonViewport.summary.debug.outputHash).toBe('a9b504096397f5b4');
  expect(status.publicAshaReadout.playableLoop.firstPersonViewport.summary.scene.frameHash).toMatch(/^fnv1a64:/);
  expect(status.publicAshaReadout.playableLoop.firstPersonViewport.summary.scene.structuralHash).toMatch(/^fnv1a64:/);
  expect(status.publicAshaReadout.playableLoop.firstPersonViewport.wallInstanceCount).toBe(3);
  expect(status.publicAshaReadout.playableLoop.autonomousTick.kind).toBe('runtime_session.autonomous_policy_tick.v0');
  expect(status.publicAshaReadout.playableLoop.autonomousTick.nav.pathHash).toBe('e8e1ea7a09811ced');
  expect(status.publicAshaReadout.playableLoop.autonomousTick.proposalSummary).toEqual({
    acceptedProposalCount: 1,
    rejectedProposalCount: 0,
    unsupportedProposalCount: 1,
  });
  expect(status.publicAshaReadout.playableLoop.autonomousTick.movementSummary.reason).toBe('movement_authority_not_wired');
  expect(status.publicAshaReadout.playableLoop.autonomousTick.combatSummary.status).toBe('accepted');
  expect(status.publicAshaReadout.playableLoop.autonomousTick.combatSummary.outcome.kind).toBe('hit');
  expect(status.publicAshaReadout.playableLoop.lifecycleAfterAutonomousTick.outcome.kind).toBe('won');
  expect(status.publicAshaReadout.playableLoop.lifecycleAfterAutonomousTick.enemy.dead).toBe(true);
  expect(status.publicAshaReadout.playableLoop.playerDefeatFixture.outcome.kind).toBe('lost');
  expect(status.publicAshaReadout.playableLoop.restartReceipt.status).toBe('accepted');
  expect(status.publicAshaReadout.playableLoop.restartReceipt.statusAfter.outcome.kind).toBe('in_progress');
  expect(status.publicAshaReadout.playableLoop.hudOverlay.projection.kind).toBe('hud_projection.v0');
  expect(status.publicAshaReadout.playableLoop.hudOverlay.projection.health.label).toBe('Health 0/40 defeated');
  expect(status.publicAshaReadout.playableLoop.hudOverlay.menuIntents.restart).toEqual({
    kind: 'runtime.restart_session_intent',
    source: 'hud_menu',
  });
  expect(status.publicAshaReadout.playableLoop.hudOverlay.menuIntents.options.kind).toBe('ui.open_options_intent');
  expect(status.publicAshaReadout.playableLoop.hudOverlay.menuIntents.exit.kind).toBe('ui.exit_to_menu_intent');
  expect(status.publicAshaReadout.playableLoop.hudOverlay.unsupportedControls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ controlId: 'hud-options', status: 'unsupported' }),
      expect.objectContaining({ controlId: 'hud-exit', status: 'unsupported' }),
    ]),
  );
  expect(status.publicAshaReadout.combatHud.combatReadout.outcome.kind).toBe('hit');
  expect(status.publicAshaReadout.combatHud.hudProjection.health.dead).toBe(true);
  expect(status.publicAshaReadout.combatHud.menuIntents.restart.kind).toBe('runtime.restart_session_intent');
  expect(status.publicAshaReadout.enemyPolicy.status).toBe('public_autonomous_policy_tick');
  expect(status.publicAshaReadout.enemyPolicy.tickReadout.policy.proposalFrame.proposals.map((proposal) => proposal.kind)).toEqual([
    'enemy_policy.move_toward_target.v0',
    'enemy_policy.primary_fire_intent.v0',
  ]);
  expect(status.publicAshaReadout.enemyPolicy.tickReadout.policy.proposalFrame.proposals[1].intent.source).toBe('enemy_policy');
  expect(status.publicAshaReadout.enemyPolicy.tickReadout.proposalReceipts[1].accepted).toBe(true);
  expect(status.publicAshaReadout.enemyPolicy.tickReadout.proposalReceipts[1].actionReceipt.combatReadout.health[0].dead).toBe(true);
  expect(status.publicAshaReadout.enemyPolicy.movementAuthority.reason).toBe('movement_authority_not_wired');
  expect(status.publicAshaReadout.enemyPolicy.sourceValidation.cleanDiagnostics).toEqual([]);
  expect(status.publicAshaReadout.enemyPolicy.sourceValidation.forbiddenDiagnostics.map((diagnostic) => diagnostic.token)).toEqual(
    expect.arrayContaining(['Date', 'Math.random', 'fetch', 'window', 'node:fs', 'import(']),
  );
  expect(status.nonClaims).toEqual(expect.arrayContaining([
    'Reference RuntimeSession playable loop only; not a full native FPS.',
    'Enemy movement remains proposal-only: movement_authority_not_wired.',
    'Generated tunnel is a public deterministic readout, not a live applied dungeon runtime.',
  ]));

  const screenshotDir = join(artifactRoot(), '4102');
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({
    path: join(screenshotDir, 'asha-demo-playable-loop.png'),
    fullPage: true,
  });
});
