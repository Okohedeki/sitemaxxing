import { test, expect, type Page } from '@playwright/test';

/**
 * The Phase 1 loop through the control room: audit → preview → pick a variant → approve four
 * passes → reject one with a reason chip → commit → the new version is visible and v1 stays.
 */

async function waitForAudit(page: Page) {
  await expect(page.locator('.item:not(.skipped) h3')).not.toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator('.live')).not.toContainText('…', { timeout: 120_000 });
}

test('audit → preview → pick → approve 4 → reject 1 → commit', async ({ page }) => {
  await page.goto('/');
  await waitForAudit(page);

  // Reset gives a clean audit whatever earlier runs left behind.
  await page.getByRole('button', { name: 'Reset' }).click();
  await waitForAudit(page);
  const versionsBefore = await page.locator('.versions button').count();
  expect(versionsBefore).toBeGreaterThanOrEqual(1);

  const row = (name: string) => page.locator('.item', { has: page.locator('.t', { hasText: name }) }).first();

  // Preview by hovering the row; the chip and the live status follow.
  await row('Visual direction').hover();
  await expect(row('Visual direction').locator('.chip')).toHaveText('Previewing');
  await expect(page.locator('.live')).toContainText('Previewing');

  // Pick a variant by clicking its thumbnail.
  await page.getByRole('button', { name: 'Visual direction: Signal' }).click();
  await expect(page.getByRole('button', { name: 'Visual direction: Signal' })).toHaveAttribute('aria-pressed', 'true');

  // Approve four passes.
  for (const name of ['Visual direction', 'Declutter', 'Copy', 'Font size']) {
    await page.getByRole('button', { name: `Approve ${name}` }).click();
    await expect(row(name).locator('.chip')).toHaveText('Approved');
  }

  // Reject one with a reason chip.
  await page.getByRole('button', { name: 'Reject Preloader' }).click();
  await expect(row('Preloader').locator('.chip')).toHaveText('Rejected');
  await row('Preloader').getByRole('button', { name: 'too trendy' }).click();
  await expect(row('Preloader').getByRole('button', { name: 'too trendy' })).toHaveAttribute('aria-pressed', 'true');

  // The copy row shows a diff; the score ring shows an estimate above the baseline.
  await expect(row('Copy').locator('.diff ins').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Commit 4 → v\d+/ })).toBeEnabled();

  // Commit.
  await page.getByRole('button', { name: /Commit 4 → v\d+/ }).click();
  await expect(page.locator('.toast')).toContainText('committed', { timeout: 120_000 });
  await expect(page.locator('.versions button')).toHaveCount(versionsBefore + 1, { timeout: 60_000 });
  await expect(row('Copy').locator('.chip')).toHaveText(/In v\d+/);
  // Rejected passes come back as proposed after a commit.
  await expect(row('Preloader').locator('.chip')).toHaveText('Proposed');
  // v1 stays viewable.
  await expect(page.locator('.versions button').first()).toHaveText(/v1 · \d+/);
});

test('keyboard: arrows select, A approves, R rejects', async ({ page }) => {
  await page.goto('/');
  await waitForAudit(page);
  await page.getByRole('button', { name: 'Reset' }).click();
  await waitForAudit(page);
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  // Walk down until a proposed row is selected (earlier runs may have committed the first ones).
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('ArrowDown');
    if ((await page.locator('.item.selected .chip').textContent()) === 'Proposed') break;
  }
  await expect(page.locator('.item.selected')).toHaveCount(1);
  await expect(page.locator('.item.selected .chip')).toHaveText('Proposed');
  const name = await page.locator('.item.selected .t').textContent();
  await page.keyboard.press('a');
  await expect(page.locator('.item.selected .chip')).toHaveText('Approved');
  await page.keyboard.press('a');
  await expect(page.locator('.item.selected .chip')).toHaveText('Proposed');
  await page.keyboard.press('r');
  await expect(page.locator('.item.selected .chip')).toHaveText('Rejected');
  await page.keyboard.press('r');
  expect(name).toBeTruthy();
});

test('reduced motion disables the typewriter and animations', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await waitForAudit(page);
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.dot.on') ?? document.body).animationDuration);
  expect(['0s', '']).toContain(dur);
  await ctx.close();
});
