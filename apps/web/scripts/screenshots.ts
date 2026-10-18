/**
 * README screenshots of the running app (M5 AC-13). Start the demo stack first (`pnpm dev:demo`,
 * with a few test sets uploaded), then: `pnpm --filter @reconcile/web screenshots`.
 */
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';

const base = process.env.WEB_URL ?? 'http://localhost:3000';
const out = path.resolve(import.meta.dirname, '../../../docs/screenshots');
const browser = await chromium.launch();

async function shot(
  name: string,
  url: string,
  scheme: 'light' | 'dark',
  prepare?: (p: Page) => Promise<void>,
) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  await page.goto(base + url);
  await page.waitForLoadState('networkidle');
  await page.getByText('Live updates on').waitFor();
  await prepare?.(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await page.close();
  console.log(`docs/screenshots/${name}.png`);
}

await shot('overview', '/', 'light');
await shot('problems', '/problems', 'light', async (p) => {
  await p
    .getByRole('button', { name: /Price over PO/ })
    .first()
    .click();
  await p
    .locator('article[aria-labelledby="problem-title"]')
    .getByText('vs the PO')
    .first()
    .waitFor();
});
await shot('problems-dark', '/problems', 'dark', async (p) => {
  await p
    .getByRole('button', { name: /Price over PO/ })
    .first()
    .click();
  await p
    .locator('article[aria-labelledby="problem-title"]')
    .getByText('vs the PO')
    .first()
    .waitFor();
});
const po = process.env.SHOT_PO ?? 'HP-PO-107093';
await shot('po', `/pos/${po}`, 'light', async (p) => {
  await p.locator('section[aria-labelledby="history-h"] li').first().waitFor();
});
await shot('document', `/pos/${po}`, 'light', async (p) => {
  await p
    .getByRole('link', { name: /Invoice/ })
    .first()
    .click();
  await p.locator('img[alt^="Page 1"]').waitFor();
  await p.waitForFunction(
    () => (document.querySelector('img[alt^="Page 1"]') as HTMLImageElement | null)?.complete,
  );
  await p.getByRole('group', { name: 'Line 1' }).locator('[tabindex="0"]').nth(2).hover();
});
await shot('upload', '/upload', 'light');
await browser.close();
