import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const repoRoot = path.resolve(import.meta.dirname, '..');
export const docsDir = path.join(repoRoot, 'docs');
export const diagramsDir = path.join(docsDir, 'diagrams');
export const manifestPath = path.join(diagramsDir, 'manifest.json');

const SKIP_DIRS = new Set(['node_modules', '.git', 'golden', 'golden-ci', 'diagrams']);

/** All Markdown files in the repo that we own (skips deps and generated data). */
export function markdownFiles(dir = repoRoot): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : markdownFiles(path.join(dir, e.name));
    return e.name.endsWith('.md') ? [path.join(dir, e.name)] : [];
  });
}

export interface MermaidBlock {
  source: string;
  /** Image path (relative to the Markdown file) embedded just before the block, if any. */
  image: string | undefined;
  index: number;
  length: number;
}

const BLOCK_RE =
  /(?:!\[[^\]]*\]\(([^)]+\.png)\)\n\n)?(?:<details><summary>Diagram source \(Mermaid\)<\/summary>\n\n)?```mermaid\n([\s\S]*?)```\n?(?:\n<\/details>\n?)?/g;

export function mermaidBlocks(markdown: string): MermaidBlock[] {
  return [...markdown.matchAll(BLOCK_RE)].map((m) => ({
    image: m[1],
    source: m[2] ?? '',
    index: m.index,
    length: m[0].length,
  }));
}

export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

export type Manifest = Record<string, string>; // repo-relative png path -> sha256 of Mermaid source

export function readManifest(): Manifest {
  return fs.existsSync(manifestPath)
    ? (JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest)
    : {};
}

export const toPosix = (p: string) => p.split(path.sep).join('/');
