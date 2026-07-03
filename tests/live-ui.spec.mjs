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

  const response = await request.get('/api/status');
  expect(response.ok()).toBe(true);
  const status = await response.json();
  expect(status.repo).toBe('asha-demo');
  expect(status.playable).toBe(false);
  expect(status.publicAshaReadout.publicImports).toEqual([
    '@asha/runtime-bridge',
    '@asha/renderer-three',
  ]);
  expect(status.publicAshaReadout.staticRoom.fixtureName).toBe('static-room');
  expect(status.publicAshaReadout.staticRoom.projectionHandleCount).toBe(7);
  expect(status.publicAshaReadout.staticRoom.rendererHandleCount).toBe(7);
  expect(status.publicAshaReadout.staticRoom.wallInstanceCount).toBe(4);
  expect(status.nonClaims).toEqual(expect.arrayContaining([
    'No movement.',
    'No shooting.',
    'No enemy AI.',
    'No procedural dungeon.',
    'No death or restart loop.',
  ]));

  const screenshotDir = artifactRoot();
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({
    path: join(screenshotDir, 'asha-demo-static-room-readout.png'),
    fullPage: true,
  });
});
