import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

async function lint(code: string, file: string) {
  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, file) });
  return result?.messages.map((m) => m.ruleId) ?? [];
}

describe('lint guardrails', () => {
  it('blocks framework imports in packages/core (ADR-0001, M1 AC-3)', async () => {
    const rules = await lint(
      "import { PrismaClient } from '@prisma/client';\nexport const c = PrismaClient;\n",
      'packages/core/src/bad.ts',
    );
    expect(rules).toContain('no-restricted-imports');
  });

  it('blocks wall clock and Math.random in the generator (ADR-0006)', async () => {
    const rules = await lint(
      'export const a = Math.random();\nexport const b = Date.now();\nexport const c = new Date();\n',
      'packages/generator/src/bad.ts',
    );
    expect(rules.filter((r) => r === 'no-restricted-properties')).toHaveLength(2);
    expect(rules).toContain('no-restricted-syntax');
  });
});
