import { expect, test } from '@playwright/test';

/**
 * M7 AC-11: the core flow on the live site. Changes need the demo password (ADR-0016), so this also
 * checks the lock: refused before unlocking, accepted after. It decides the smallest open problem,
 * so each run changes as little of the demo as possible.
 */
const password = process.env.DEMO_PASSWORD;

test('live site: look around, unlock changes, decide, and find it in the history', async ({
  page,
}) => {
  test.skip(!password, 'DEMO_PASSWORD is not set');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Money at risk' })).toBeVisible();
  await expect(page.getByText('Live updates on')).toBeVisible();

  await page.goto('/problems');
  const list = page.getByRole('navigation', { name: 'Open problems' });
  const rows = list.getByRole('button');
  await expect(rows.first()).toBeVisible();
  await rows.last().click();
  const detail = page.locator('article[aria-labelledby="problem-title"]');
  const po = (await detail.locator('a.mono').first().textContent())!.trim();

  // Locked: the decision is refused and the unlock dialog opens.
  const note = `Live smoke test ${new Date().toISOString()}`;
  await page.keyboard.press('w');
  await page.keyboard.type(note);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Unlock changes' });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel('Demo password').fill(password!);
  await dialog.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText('Changes unlocked', { exact: true })).toBeVisible();

  // Unlocked: decide again; it saves.
  await page.locator('#note').fill(note);
  await page.getByRole('button', { name: /Write off/ }).click();
  await page.getByRole('button', { name: 'Save decision' }).click();
  await expect(page.getByText(/^Written off: /)).toBeVisible();

  await page.goto(`/pos/${po}`);
  await expect(page.locator('section[aria-labelledby="history-h"]').getByText(note)).toBeVisible();
});
