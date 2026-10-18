import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * M5 AC-12: upload a document set → wait until matched → open the costliest problem → write it
 * off with a note (by keyboard) → find the decision in the PO's history. Every page visited is
 * checked by axe for serious accessibility problems (AC-11).
 */
const SET = path.resolve(import.meta.dirname, '../../../evals/golden-ci/S0023');
const truth = JSON.parse(fs.readFileSync(path.join(SET, 'ground_truth.json'), 'utf8')) as {
  poNumber: string;
  documents: { file: string }[];
};
const NOTE = 'Freight line not on the PO; under our dispute threshold.';

async function expectAccessible(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`);
  expect(serious, `accessibility problems on ${where}`).toEqual([]);
}

test('upload, decide, and see it in the history', async ({ page }) => {
  // 1. Upload the three documents and watch them get matched, live.
  await page.goto('/upload');
  await expect(page.getByText('Live updates on')).toBeVisible();
  await page.setInputFiles(
    '#file-input',
    truth.documents.map((d) => path.join(SET, d.file)),
  );
  const rows = page.locator('section[aria-labelledby="sent-h"] tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.and(page.locator('[data-status="MATCHED"]'))).toHaveCount(3, {
    timeout: 60_000,
  });
  await expect(rows.first().getByRole('link', { name: truth.poNumber })).toBeVisible();
  await expectAccessible(page, 'upload');

  // 2. The overview shows money at risk.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Money at risk' })).toBeVisible();
  await expectAccessible(page, 'overview');

  // 3. Jump to problems with the keyboard; the costliest problem is selected first.
  await page.keyboard.press('g');
  await page.keyboard.press('p');
  await expect(page).toHaveURL(/\/problems/);
  const detail = page.locator('article[aria-labelledby="problem-title"]');
  await expect(detail.getByText('Line not on PO').first()).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'At risk' })).toBeVisible();
  await expect(detail.getByText('$229.92', { exact: true }).first()).toBeVisible();
  await expectAccessible(page, 'problems');

  // 4. Write it off with a note, by keyboard. An empty note is refused first.
  await page.keyboard.press('w');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Add a note first' })).toBeVisible();
  await page.keyboard.type(NOTE);
  await page.keyboard.press('Enter');
  await expect(page.getByText(/^Written off: .*\$229\.92/)).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Open problems' }).getByText('1 open'),
  ).toBeVisible();

  // 5. The decision, who made it, and the note are in the PO's history.
  await page.goto(`/pos/${truth.poNumber}`);
  const history = page.locator('section[aria-labelledby="history-h"]');
  await expect(history.getByText('Wrote off line not on PO ($229.92)')).toBeVisible();
  await expect(history.getByText(NOTE)).toBeVisible();
  await expectAccessible(page, 'PO detail');

  // 6. The invoice shows its page image with the AI's boxes.
  await page
    .getByRole('link', { name: /Invoice/ })
    .first()
    .click();
  await expect(page.getByRole('img', { name: /Page 1 of invoice/ })).toBeVisible();
  await expect
    .poll(() =>
      page.locator('img[alt^="Page 1"]').evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expectAccessible(page, 'document');

  // 7. Dark mode keeps readable contrast too.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/problems?show=decided');
  await expect(page.getByText(NOTE)).toBeVisible();
  await expectAccessible(page, 'problems (dark)');
});
