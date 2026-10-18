import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** M5 AC-8: colors live only in tokens.css; components use the token names. */
describe('design tokens', () => {
  const src = path.resolve(import.meta.dirname, '../src');
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'api' ? [] : files(p);
      return /\.(css|tsx?)$/.test(e.name) && e.name !== 'tokens.css' ? [p] : [];
    });
  it('no raw color values outside tokens.css', () => {
    const offenders: string[] = [];
    for (const f of files(src))
      fs.readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (line.includes('token-exempt')) return;
          if (
            /#[0-9a-fA-F]{3,8}\b(?![\w-])|rgba?\(|hsla?\(/.test(
              line.replace(/href="#[\w-]+"|#main|#[a-z]+-[\w-]+/g, ''),
            )
          )
            offenders.push(`${path.relative(src, f)}:${i + 1}: ${line.trim()}`);
        });
    expect(offenders).toEqual([]);
  });
});
