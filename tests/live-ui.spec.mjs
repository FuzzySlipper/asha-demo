import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

function brokerBaseUrl() {
  return process.env.PLAYWRIGHT_BROKER_BASE_URL ?? process.env.BASE_URL ?? null;
}

function artifactRoot() {
  return process.env.PLAYWRIGHT_BROKER_ARTIFACT_ROOT ?? 'artifacts/playwright-local';
}

test('@live-agent asha-demo shows objective static ASHA readout', async ({ page, request }) => {
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ASHA Demo' })).toBeVisible();
  await expect(page.getByText('This is not a playable FPS.')).toBeVisible();

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
  await movement.getByRole('button', { name: 'Forward' }).click();
  await expect(movement).toContainText('Tick');
  await movement.getByRole('button', { name: 'Look Right' }).click();
  await expect(movement).toContainText('Yaw / pitch');
  await movement.getByRole('button', { name: 'Probe Wall Stop' }).click();
  await expect(movement).toContainText('blocked z');
  await expect(movement).toContainText('fnv1a64:');

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
  await combatHud.getByRole('button', { name: 'Fire Static Target' }).click();
  await expect(combatHud).toContainText('Intent');
  await expect(combatHud).toContainText('primary_fire');
  await expect(combatHud).toContainText('Payload');
  await expect(combatHud).toContainText('none');

  const enemyPolicy = page.locator('[data-demo-readout="public-asha-enemy-policy"]');
  await expect(enemyPolicy).toBeVisible();
  await expect(enemyPolicy).toContainText('Enemy Policy');
  await expect(enemyPolicy).toContainText('read-only proposal-only');
  await expect(enemyPolicy).toContainText('enemy_policy.move_toward_target.v0');
  await expect(enemyPolicy).toContainText('enemy_policy.primary_fire_intent.v0');
  await expect(enemyPolicy).toContainText('e8e1ea7a09811ced');
  await expect(enemyPolicy).toContainText('Date');
  await enemyPolicy.getByRole('button', { name: 'Run Enemy Policy' }).click();
  await expect(enemyPolicy).toContainText('Fire status');
  await expect(enemyPolicy).toContainText('accepted');
  await expect(enemyPolicy).toContainText('Health 0/40 defeated');

  const response = await request.get('/api/status');
  expect(response.ok()).toBe(true);
  const status = await response.json();
  expect(status.repo).toBe('asha-demo');
  expect(status.playable).toBe(false);
  expect(status.publicAshaReadout.publicImports).toEqual([
    '@asha/runtime-bridge',
    '@asha/renderer-three',
    '@asha/ui-dom',
  ]);
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
  expect(status.publicAshaReadout.combatHud.combatReadout.outcome.kind).toBe('hit');
  expect(status.publicAshaReadout.combatHud.hudProjection.health.dead).toBe(true);
  expect(status.publicAshaReadout.combatHud.menuIntents.restart.kind).toBe('runtime.restart_session_intent');
  expect(status.publicAshaReadout.enemyPolicy.status).toBe('public_enemy_policy_fixture');
  expect(status.publicAshaReadout.enemyPolicy.view.readOnly).toBe(true);
  expect(status.publicAshaReadout.enemyPolicy.view.proposalOnly).toBe(true);
  expect(status.publicAshaReadout.enemyPolicy.view.navPathHash).toBe('e8e1ea7a09811ced');
  expect(status.publicAshaReadout.enemyPolicy.frame.proposals.map((proposal) => proposal.kind)).toEqual([
    'enemy_policy.move_toward_target.v0',
    'enemy_policy.primary_fire_intent.v0',
  ]);
  expect(status.publicAshaReadout.enemyPolicy.frame.proposals[1].intent.source).toBe('enemy_policy');
  expect(status.publicAshaReadout.enemyPolicy.fireReceipt.accepted).toBe(true);
  expect(status.publicAshaReadout.enemyPolicy.fireReceipt.combatReadout.health[0].dead).toBe(true);
  expect(status.publicAshaReadout.enemyPolicy.sourceValidation.cleanDiagnostics).toEqual([]);
  expect(status.publicAshaReadout.enemyPolicy.sourceValidation.forbiddenDiagnostics.map((diagnostic) => diagnostic.token)).toEqual(
    expect.arrayContaining(['Date', 'Math.random', 'fetch', 'window', 'node:fs', 'import(']),
  );
  expect(status.nonClaims).toEqual(expect.arrayContaining([
    'No autonomous enemy gameplay loop.',
    'No continuous combat loop.',
    'No live procedural dungeon gameplay.',
    'No death or restart loop.',
  ]));

  const screenshotDir = artifactRoot();
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({
    path: join(screenshotDir, 'asha-demo-static-room-readout.png'),
    fullPage: true,
  });
});
