/**
 * `pnpm generate:samples`: one PNG thumbnail per template family (plus PO and RR) for the README.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildSet } from './build-set.ts';
import { buildCatalog } from './catalog/index.ts';
import { resolveRates } from './config.ts';
import { renderPdf } from './render/pdf.ts';
import { rasterize } from './render/scan.ts';

const outDir = path.resolve(process.argv[2] ?? 'docs/images/samples');
await fs.mkdir(outDir, { recursive: true });

const catalog = buildCatalog();
const rates = resolveRates({ cleanSetRate: 1 });
const wanted = new Set(['po', 'rr', 'classic', 'modern', 'erp', 'twocol', 'boxed', 'letterhead']);

for (let i = 0; wanted.size > 0 && i < 500; i++) {
  for (const doc of buildSet(catalog, rates, 42, i).docs) {
    const key = doc.type === 'INVOICE' ? doc.style.family : doc.role;
    if (!wanted.has(key) || doc.lines.length > 8) continue;
    wanted.delete(key);
    const { bytes } = await renderPdf(doc);
    const canvas = await rasterize(bytes, 60);
    await fs.writeFile(path.join(outDir, `${key}.png`), await canvas.encode('png'));
    console.log(`wrote ${key}.png`);
  }
}
