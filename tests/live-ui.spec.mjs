import { test, expect } from '@playwright/test';

test('the visible encounter waits for Start, pauses hostile authority, and restarts through KeyR', async ({ page }) => {
  test.setTimeout(30_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  const canvas = page.locator('#asha-render-surface');
  const event = page.locator('#event-state');
  const shots = page.locator('#shot-state');
  const targets = page.locator('#target-state');
  const fire = page.locator('#fire-button');
  const reset = page.locator('#reset-button');
  const playerHealth = page.locator('#player-health-state');
  const pauseMenu = page.locator('#pause-menu');

  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-camera-fov-y-degrees', '58');
  await expect(pauseMenu).toBeVisible();
  await expect(pauseMenu).toHaveAttribute('data-mode', 'title');
  await expect(page.locator('#pause-menu-title')).toHaveText('ASHA Demo');
  await expect(fire).toBeDisabled();
  await expect(event).not.toContainText(/backend missing|failed|unavailable/i);
  await expect(targets).toHaveText('45/45');
  const healthBeforeStart = await playerHealth.textContent();
  await page.waitForTimeout(1_600);
  await expect(playerHealth).toHaveText(healthBeforeStart ?? '100/100');

  await page.locator('#menu-reset-button').click();
  await expect(pauseMenu).toBeHidden();
  await expect(fire).toBeEnabled({ timeout: 30_000 });
  await expect(event).toContainText(/encounter started|sentinel/i);

  const shotsBefore = await shots.textContent();
  const eventBefore = await event.textContent();
  await fire.click();
  await expect.poll(() => shots.textContent()).not.toBe(shotsBefore);
  await expect.poll(() => event.textContent()).not.toBe(eventBefore);

  await page.locator('#pause-button').click();
  await expect(pauseMenu).toBeVisible();
  await expect(fire).toBeDisabled();
  const healthWhilePaused = await playerHealth.textContent();
  await page.waitForTimeout(1_600);
  await expect(playerHealth).toHaveText(healthWhilePaused ?? '100/100');
  await page.locator('#resume-button').click();
  await expect(pauseMenu).toBeHidden();
  await expect(fire).toBeEnabled();

  await canvas.focus();
  await page.keyboard.press('KeyR');
  await expect(shots).toHaveText('0 hits · 0 misses');
  await expect(event).toContainText(/encounter started|sentinel/i);
  await expect(playerHealth).toHaveText('100/100');
  await expect(reset).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('a no-op fire control would fail visible acceptance', async ({ page }) => {
  await page.goto('/');
  await page.locator('#menu-reset-button').click();
  const fire = page.locator('#fire-button');
  const shots = page.locator('#shot-state');
  await expect(fire).toBeEnabled({ timeout: 30_000 });
  const before = await shots.textContent();
  await fire.click();
  await expect.poll(() => shots.textContent()).not.toBe(before);
});

test('the visible contextual switch uses E and moves the Rust-projected security door', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.locator('#menu-reset-button').click();
  const canvas = page.locator('#asha-render-surface');
  const prompt = page.locator('#interaction-prompt');
  const event = page.locator('#event-state');

  await expect(prompt).toContainText('E  OPERATE SECURITY SWITCH', { timeout: 10_000 });
  await canvas.click();
  await expect.poll(
    () => page.evaluate(() => document.pointerLockElement?.id ?? null),
  ).toBe('asha-render-surface');
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await expect(event).toContainText('Security switch accepted');
  await expect(event).not.toContainText(/rejected|failed|unavailable/i);
  expect(pageErrors).toEqual([]);
});

test('missing presentation resources fail visibly without inline fallbacks', async ({ browser }) => {
  const resources = [
    'assets/mesh-animation/kenney-retro-character-medium.glb',
    'assets/presentation/primary-fire-pulse.wav',
    'assets/presentation/primary-fire-spark.svg',
  ];
  for (const resource of resources) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.route(`**/${resource}`, (route) => route.fulfill({ status: 404, body: 'missing' }));
    await page.goto('/');
    await expect(page.locator('#event-state')).toContainText('Startup failed', { timeout: 30_000 });
    await expect(page.locator('#event-state')).toContainText(resource);
    await expect(page.locator('#fire-button')).toBeDisabled();
    expect(pageErrors.some((message) => message.includes(resource))).toBe(true);
    await page.close();
  }
});
