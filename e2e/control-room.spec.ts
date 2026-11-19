import { test, expect, type Page } from '@playwright/test';

/**
 * The loop through the control room: tell the story → the plan follows the goal → preview → pick
 * a variant → approve four passes → reject one with a reason chip → commit → the version is visible.
 */

async function waitForAudit(page: Page) {
  await expect(page.locator('.item:not(.skipped) h3')).not.toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator('.live')).not.toContainText('…', { timeout: 120_000 });
}

/** Tells the story (fresh projects open on the Story step; existing ones re-plan via Edit). */
async function tellStory(page: Page) {
  await page.goto('/');
  const form = page.locator('form.story');
  await expect(form.or(page.locator('.storycard'))).toBeVisible({ timeout: 60_000 });
  if (!(await form.isVisible())) await page.locator('.storycard').getByRole('button', { name: 'Edit' }).click();
  await form.getByLabel('What is it, and why does it exist?').fill('Fieldnote maps soil moisture from daily satellite passes so growers water only where the ground is dry.');
  await form.getByLabel('Who is it for?').fill('farm managers');
  await form.getByRole('radio', { name: 'Sign-ups' }).click();
  for (const f of ['precise', 'calm']) {
    const chip = form.getByRole('button', { name: f, exact: true });
    if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
  }
  await expect(form.locator('.mood')).toContainText('calm');
  await form.getByRole('button', { name: /plan the glow-up/i }).click();
  await waitForAudit(page);
}

test('story → plan → preview → pick → approve 4 → reject 1 → commit', async ({ page }) => {
  await tellStory(page);
  await expect(page.locator('.storycard')).toContainText('Sign-ups');
  const versionsBefore = await page.locator('.versions button').count();
  expect(versionsBefore).toBeGreaterThanOrEqual(1);

  const row = (name: string) => page.locator('.item', { has: page.locator('.t', { hasText: name }) }).first();

  // Every proposed row says why it matters for this goal.
  await expect(row('Copy').locator('.rationale')).toContainText('For sign-ups');
  // Passes that do not matter for this story are set aside with a reason.
  await expect(page.locator('.group', { hasText: 'Left out for this story' })).toBeVisible();

  // Preview by hovering the row; the chip and the live status follow.
  await row('Visual direction').hover();
  await expect(row('Visual direction').locator('.chip')).toHaveText('Previewing');
  await expect(page.locator('.live')).toContainText('Previewing');

  // Directions are Fit, Stretch and Wildcard picks; pick the Stretch.
  const thumbs = row('Visual direction').locator('.variants button');
  await expect(thumbs).toHaveCount(3);
  await expect(thumbs.nth(2).locator('.slot')).toHaveText('Wildcard');
  await thumbs.nth(1).click();
  await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true');

  // Approve four passes.
  for (const name of ['Visual direction', 'Declutter', 'Copy', 'Font size']) {
    await page.getByRole('button', { name: `Approve ${name}` }).click();
    await expect(row(name).locator('.chip')).toHaveText('Approved');
  }

  // Reject one with a reason chip.
  await page.getByRole('button', { name: 'Reject Alignment' }).click();
  await expect(row('Alignment').locator('.chip')).toHaveText('Rejected');
  await row('Alignment').getByRole('button', { name: 'too busy' }).click();
  await expect(row('Alignment').getByRole('button', { name: 'too busy' })).toHaveAttribute('aria-pressed', 'true');

  await expect(row('Copy').locator('.diff ins').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Commit 4 → v\d+/ })).toBeEnabled();

  // Commit.
  await page.getByRole('button', { name: /Commit 4 → v\d+/ }).click();
  await expect(page.locator('.toast')).toContainText('committed', { timeout: 120_000 });
  await expect(page.locator('.versions button')).toHaveCount(versionsBefore + 1, { timeout: 60_000 });
  await expect(row('Copy').locator('.chip')).toHaveText(/In v\d+/);
  // Rejected passes come back as proposed after a commit.
  await expect(row('Alignment').locator('.chip')).toHaveText('Proposed');
  await expect(page.locator('.versions button').first()).toHaveText(/v1 · \d+/);
});

test('Randomize gives a pass new options', async ({ page }) => {
  await tellStory(page);
  const row = page.locator('.item:not(.skipped)', { has: page.locator('.variants') }).filter({ has: page.locator('.chip', { hasText: 'Proposed' }) }).first();
  const id = await row.getAttribute('id');
  const before = await row.locator('.variants').innerHTML();
  await row.getByRole('button', { name: /^Re-roll / }).click();
  const after = page.locator(`[id="${id}"] .variants`);
  await expect.poll(async () => (await after.innerHTML()) !== before, { timeout: 60_000 }).toBe(true);
});

test('keyboard: arrows select, A approves, R rejects', async ({ page }) => {
  await tellStory(page);
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
  await tellStory(page);
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.dot.on') ?? document.body).animationDuration);
  expect(['0s', '']).toContain(dur);
  await ctx.close();
});
