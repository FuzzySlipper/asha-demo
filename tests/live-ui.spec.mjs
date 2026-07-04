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
  expect(pose?.position).toEqual([0, 1.62, 0]);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.pointerLocked?.() ?? null)).toBe(false);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.movementState?.().authority ?? null)).toBe(
    'external_collision',
  );

  const fireResult = await page.evaluate(() => globalThis.ashaRendererSurface?.firePrimary?.() ?? null);
  expect(fireResult?.shotsFired).toBe(1);
  expect(await page.evaluate(() => globalThis.ashaRendererSurface?.interactionState?.().shotsFired ?? null)).toBe(1);
  expect(
    await page.evaluate(() =>
      globalThis.ashaRendererSurface?.runtimeTelemetry?.().replayRecords.some(
        (record) => record.kind === 'createCamera',
      ) ?? null,
    ),
  ).toBe(true);
});
