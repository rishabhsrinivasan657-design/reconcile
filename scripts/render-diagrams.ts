/**
 * `pnpm docs:diagrams`: render every Mermaid block in docs/ to a PNG so diagrams show in any
 * Markdown viewer. The block stays as the source of truth, collapsed under the image.
 * Writes docs/diagrams/manifest.json (image -> sha256 of source) for the CI freshness check.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  diagramsDir,
  docsDir,
  manifestPath,
  markdownFiles,
  mermaidBlocks,
  readManifest,
  repoRoot,
  sha256,
  toPosix,
  type Manifest,
} from './docs-lib.ts';

const mmdc = path.join(repoRoot, 'node_modules', '.bin', 'mmdc');
const configPath = path.join(diagramsDir, '.mermaid-config.json');
const force = process.argv.includes('--force');

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

function titleFor(before: string): { title: string; slugText: string } {
  const heading = ([...before.matchAll(/^#+\s+(.+)$/gm)].pop()?.[1] ?? 'diagram').replace(
    /[`*]/g,
    '',
  );
  const label = before.slice(-200).match(/\*\*([^*]+)\*\*\s*$/)?.[1];
  return {
    title: label ? `${heading}: ${label}` : heading,
    slugText: label ?? heading.replace(/^\d+\.\s*/, ''),
  };
}

const oldManifest = readManifest();
const manifest: Manifest = {};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-mmd-'));
fs.mkdirSync(diagramsDir, { recursive: true });

for (const file of markdownFiles(docsDir)) {
  const src = fs.readFileSync(file, 'utf8');
  const blocks = mermaidBlocks(src);
  if (blocks.length === 0) continue;
  const base = toPosix(path.relative(docsDir, file))
    .replace(/\.md$/, '')
    .replace(/\//g, '-')
    .toLowerCase();
  let out = '';
  let last = 0;
  blocks.forEach((block, i) => {
    const { title, slugText } = titleFor(src.slice(0, block.index));
    const png = path.join(diagramsDir, `${base}-${i + 1}-${slug(slugText)}.png`);
    const key = toPosix(path.relative(repoRoot, png));
    const hash = sha256(block.source);
    if (force || oldManifest[key] !== hash || !fs.existsSync(png)) {
      const mmd = path.join(tmp, 'in.mmd');
      fs.writeFileSync(mmd, block.source);
      execFileSync(mmdc, ['-i', mmd, '-o', png, '-c', configPath, '-b', 'white', '-s', '2', '-q']);
      console.log(`rendered ${key}`);
    }
    manifest[key] = hash;
    const rel = toPosix(path.relative(path.dirname(file), png));
    out +=
      src.slice(last, block.index) +
      `![${title}](${rel})\n\n<details><summary>Diagram source (Mermaid)</summary>\n\n` +
      '```mermaid\n' +
      block.source +
      '```\n\n</details>\n';
    last = block.index + block.length;
  });
  fs.writeFileSync(file, out + src.slice(last));
}

// Remove images whose source block no longer exists.
for (const key of Object.keys(oldManifest)) {
  if (!(key in manifest)) fs.rmSync(path.join(repoRoot, key), { force: true });
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${Object.keys(manifest).length} diagrams up to date`);
