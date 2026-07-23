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

test('the visible contextual switch rejects a second no-op and survives save, reopen, and restart', async ({ page }) => {
  test.setTimeout(45_000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#menu-reset-button').click();
  const canvas = page.locator('#asha-render-surface');
  const prompt = page.locator('#interaction-prompt');
  const event = page.locator('#event-state');
  const pauseMenu = page.locator('#pause-menu');
  const saveStatus = page.locator('#save-game-status');

  await expect(prompt).toContainText('E  OPERATE SECURITY SWITCH', { timeout: 10_000 });
  const closedDoor = await screenshotDoorway(page, canvas);
  await canvas.click();
  await expect.poll(
    () => page.evaluate(() => document.pointerLockElement?.id ?? null),
  ).toBe('asha-render-surface');
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await expect(prompt).toBeHidden();
  const openDoor = await screenshotDoorway(page, canvas);
  expect(openDoor.equals(closedDoor)).toBe(false);

  await page.keyboard.press('KeyE');
  await page.waitForTimeout(250);
  await expect(event).not.toContainText('Security switch accepted');
  await expect(prompt).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(pauseMenu).toBeVisible();
  await page.waitForTimeout(2_500);
  await expect(prompt).toBeHidden();

  await page.locator('#save-game-button').click();
  await expect(saveStatus).toContainText('Game saved');
  await page.locator('#load-game-button').click();
  await expect(pauseMenu).toBeVisible({ timeout: 30_000 });
  await expect(pauseMenu).toHaveAttribute('data-mode', 'paused');
  await expect(saveStatus).toContainText('Saved game restored through Rust authority');
  await expect(prompt).toBeHidden();
  const restoredDoor = await screenshotDoorway(page, canvas);
  expect(restoredDoor.equals(closedDoor)).toBe(false);
  await expect.poll(() => readAuthoredSchedulerState(page)).toMatchObject({
    pending: 1,
    outstanding: 0,
  });

  await page.locator('#resume-button').click();
  await expect(pauseMenu).toBeHidden();
  await page.waitForTimeout(750);
  await expect.poll(() => readAuthoredSchedulerState(page)).toMatchObject({
    pending: 1,
    outstanding: 0,
  });

  await page.locator('#reset-button').click();
  await expect(prompt).toContainText('E  OPERATE SECURITY SWITCH');
  await expect.poll(() => readAuthoredSchedulerState(page)).toMatchObject({
    pending: 0,
    outstanding: 0,
  });
  expect(pageErrors).toEqual([]);
});

test('the closed security door blocks movement and the opened door permits passage', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.locator('#menu-reset-button').click();
  const canvas = page.locator('#asha-render-surface');
  const prompt = page.locator('#interaction-prompt');
  const event = page.locator('#event-state');

  await expect(prompt).toContainText('E  OPERATE SECURITY SWITCH', { timeout: 10_000 });
  await canvas.click();
  await expect.poll(
    () => page.evaluate(() => document.pointerLockElement?.id ?? null),
  ).toBe('asha-render-surface');

  await page.keyboard.down('KeyW');
  await page.waitForTimeout(750);
  await page.keyboard.up('KeyW');
  await expect(event).toContainText('Blocked z');
  const blockedZ = await readAuthorityPlayerZ(canvas);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(150);
  await page.keyboard.up('KeyW');
  expect(await readAuthorityPlayerZ(canvas)).toBeCloseTo(blockedZ, 4);
  const blockedView = await canvas.screenshot();

  await page.keyboard.press('KeyE');
  await expect(prompt).toBeHidden();
  await page.keyboard.down('KeyW');
  try {
    await expect.poll(
      () => readAuthorityPlayerZ(canvas),
      {
        message: 'Rust-authoritative player position should cross the far face of the doorway',
        timeout: 2_000,
        intervals: [50, 100, 100],
      },
    ).toBeLessThan(-1.2);
  } finally {
    await page.keyboard.up('KeyW');
  }
  const passedView = await canvas.screenshot();
  expect(passedView.equals(blockedView)).toBe(false);
});

async function readAuthorityPlayerZ(canvas) {
  const encoded = await canvas.getAttribute('data-authority-player-position');
  return Number(encoded?.split(',')[2] ?? Number.POSITIVE_INFINITY);
}

async function screenshotDoorway(page, canvas) {
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error('renderer canvas has no visible bounds');
  }
  return page.screenshot({
    clip: {
      x: box.x + box.width * 0.34,
      y: box.y + box.height * 0.18,
      width: box.width * 0.3,
      height: box.height * 0.55,
    },
  });
}

async function readAuthoredSchedulerState(page) {
  const canvas = page.locator('#asha-render-surface');
  const [pending, outstanding, tick] = await Promise.all([
    canvas.getAttribute('data-authority-pending-actions'),
    canvas.getAttribute('data-authority-outstanding-dispatches'),
    canvas.getAttribute('data-authority-tick'),
  ]);
  return {
    pending: Number(pending ?? Number.POSITIVE_INFINITY),
    outstanding: Number(outstanding ?? Number.POSITIVE_INFINITY),
    tick: Number(tick ?? -1),
  };
}

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
