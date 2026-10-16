/**
 * `pnpm docs:check` (runs in CI):
 *   1. every relative Markdown link and image resolves to a file
 *   2. every Mermaid block has a rendered PNG whose manifest hash matches its source
 * CI never renders diagrams (PNG bytes differ across OSes). It only compares hashes.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  markdownFiles,
  mermaidBlocks,
  readManifest,
  repoRoot,
  sha256,
  toPosix,
} from './docs-lib.ts';

const problems: string[] = [];
const manifest = readManifest();
const LINK_RE = /!?\[[^\]]*\]\(([^)\s]+)\)/g;

for (const file of markdownFiles()) {
  const rel = toPosix(path.relative(repoRoot, file));
  const text = fs.readFileSync(file, 'utf8');
  const withoutCode = text.replace(/```[\s\S]*?```/g, '');

  for (const [, target] of withoutCode.matchAll(LINK_RE)) {
    if (!target || /^(https?:|mailto:|#)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURI(target.split('#')[0] ?? ''));
    if (!fs.existsSync(resolved)) problems.push(`${rel}: broken link -> ${target}`);
  }

  for (const block of mermaidBlocks(text)) {
    if (!block.image) {
      problems.push(`${rel}: Mermaid block has no rendered image (run pnpm docs:diagrams)`);
      continue;
    }
    const key = toPosix(path.relative(repoRoot, path.resolve(path.dirname(file), block.image)));
    if (manifest[key] !== sha256(block.source)) {
      problems.push(`${rel}: ${key} is stale (run pnpm docs:diagrams)`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  console.error(`\n${problems.length} docs problem(s).`);
  process.exit(1);
}
console.log('✓ docs: links resolve, diagrams up to date');
