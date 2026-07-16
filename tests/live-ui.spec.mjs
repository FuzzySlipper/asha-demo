import { test, expect } from '@playwright/test';

test('the visible Game Project starts with Rust authority and responds to player controls', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');

  const canvas = page.locator('#asha-render-surface');
  const event = page.locator('#event-state');
  const shots = page.locator('#shot-state');
  const targets = page.locator('#target-state');
  const fire = page.locator('#fire-button');
  const reset = page.locator('#reset-button');

  await expect(canvas).toBeVisible();
  await expect(fire).toBeEnabled({ timeout: 30_000 });
  await expect(event).not.toContainText(/backend missing|failed|unavailable/i);
  await expect(targets).toHaveText(/\d+\/\d+/);

  const shotsBefore = await shots.textContent();
  const eventBefore = await event.textContent();
  await fire.click();
  await expect.poll(() => shots.textContent()).not.toBe(shotsBefore);
  await expect.poll(() => event.textContent()).not.toBe(eventBefore);

  await page.locator('#pause-button').click();
  await expect(page.locator('#pause-menu')).toBeVisible();
  await expect(fire).toBeDisabled();
  await page.locator('#resume-button').click();
  await expect(page.locator('#pause-menu')).toBeHidden();
  await expect(fire).toBeEnabled();

  await reset.click();
  await expect(shots).toHaveText('0/0');
  await expect(event).toContainText(/reset|ready/i);
  expect(pageErrors).toEqual([]);
});

test('a no-op fire control would fail visible acceptance', async ({ page }) => {
  await page.goto('/');
  const fire = page.locator('#fire-button');
  const shots = page.locator('#shot-state');
  await expect(fire).toBeEnabled({ timeout: 30_000 });
  const before = await shots.textContent();
  await fire.click();
  await expect.poll(() => shots.textContent()).not.toBe(before);
});
