import { expect, test } from '@playwright/test';

function brokerBaseUrl() {
  return process.env.PLAYWRIGHT_BROKER_BASE_URL ?? process.env.BASE_URL ?? null;
}

test('@live-agent asha-demo mounts the upstream ASHA renderer surface', async ({ page }) => {
  const baseUrl = brokerBaseUrl();
  expect(baseUrl, 'live UI smoke must use broker-provided BASE_URL').not.toBeNull();

  await page.goto('/');

  const canvas = page.locator('[data-demo-readout="asha-renderer-browser-surface"]');
  await expect(canvas).toBeVisible();
  await expect(page.locator('[data-demo-readout="reticle"]')).toBeVisible();
  await expect(page.locator('#fire-button')).toBeVisible();
  await expect(page.locator('#reset-button')).toBeVisible();
  await expect.poll(async () => canvas.evaluate((node) => node.clientWidth)).toBeGreaterThan(100);
  await expect.poll(async () => canvas.evaluate((node) => node.clientHeight)).toBeGreaterThan(100);

  const surface = await page.evaluate(() => globalThis.ashaRendererSurface?.kind ?? null);
  expect(surface).toBe('asha_renderer_browser_surface.v0');

  const pose = await page.evaluate(() => globalThis.ashaRendererSurface?.cameraPose?.() ?? null);
  expect(pose?.position).toEqual([0, 1.62, 1.25]);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.pointerLocked?.() ?? null)).toBe(false);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.movementState?.().authority ?? null)).toBe(
    'external_collision',
  );
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().valid ?? null)).toBe(true);
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().sourceFiles ?? null),
  ).toMatchObject({
    projectBundle: '/project/project-bundle.json',
    sceneDocument: 'levels/scenes/generated-tunnel-room.scene.json',
    entityDefinitions: [
      'catalogs/actors/demo-player.entity.json',
      'catalogs/actors/generated-tunnel-enemy.entity.json',
    ],
  });
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().runtimeLoaded ?? null)).toBe(true);
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().levelRenderProjectionHash ?? null),
  ).toBe('fnv1a64:21eb8696f6f3b5c4');
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.snapshot?.() ?? ''),
  ).toContain('generated-tunnel-enemy');
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.snapshot?.() ?? ''),
  ).toContain('generated-tunnel-floor');
  expect(
    await page.evaluate(() => globalThis.ashaRendererSurface?.projectContentStatus?.().runtimeBootstrapHash ?? null),
  ).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entityCount ?? null)).toBe(2);
  expect(
    await page.evaluate(() =>
      globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.map(
        (entity) => entity.definitionStableId,
      ) ?? [],
    ),
  ).toEqual(['actor/demo-player', 'actor/generated-tunnel-enemy']);

  await canvas.evaluate((node) => node.focus());
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.movementState?.().authority ?? null)).toBe(
    'external_collision',
  );
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.movementState?.().collided ?? null)).toBe(true);

  const fireResult = await page.evaluate(() => globalThis.ashaRendererSurface?.firePrimary?.() ?? null);
  expect(fireResult?.interaction?.shotsFired).toBe(1);
  expect(fireResult?.interaction?.remainingTargets).toBe(0);
  expect(fireResult?.runtime?.accepted).toBe(true);
  expect(fireResult?.runtime?.combatReadout?.outcome.kind).toBe('hit');
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().shotsFired ?? null)).toBe(1);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().remainingTargets ?? null)).toBe(0);
  expect(
    await page.evaluate(() => {
      const enemy = globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.find(
        (entity) => entity.definitionStableId === 'actor/generated-tunnel-enemy',
      );
      return enemy?.capabilities.find((capability) => capability.kind === 'health') ?? null;
    }),
  ).toMatchObject({ kind: 'health', current: 0, max: 40, dead: true });
  expect(
    await page.evaluate(() =>
      globalThis.ashaRendererSurface?.runtimeTelemetry?.().replayRecords.some(
        (record) => record.kind === 'submitRuntimeActionIntent',
      ) ?? null,
    ),
  ).toBe(true);

  await page.evaluate(() => globalThis.ashaRendererSurface?.reset?.());
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().shotsFired ?? null)).toBe(0);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().remainingTargets ?? null)).toBe(1);
  expect(
    await page.evaluate(() => {
      const enemy = globalThis.ashaRendererSurface?.runtimeEcrpReadout?.().entities.find(
        (entity) => entity.definitionStableId === 'actor/generated-tunnel-enemy',
      );
      return enemy?.capabilities.find((capability) => capability.kind === 'health') ?? null;
    }),
  ).toMatchObject({ kind: 'health', current: 40, max: 40, dead: false });
});
