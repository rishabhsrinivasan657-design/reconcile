// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'evals/golden*/**',
      'packages/db/src/generated/**',
      'packages/db/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // ADR-0001: core stays pure. No DB, HTTP, UI, or queue frameworks.
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@prisma/*',
                '@reconcile/db',
                'fastify',
                'next',
                'next/*',
                'bullmq',
                'ioredis',
              ],
              message: 'packages/core must stay pure (ADR-0001). Inject this dependency instead.',
            },
            {
              group: ['@reconcile/generator', '@reconcile/generator/*'],
              message:
                'The matcher must not see how answer keys are built (ADR-0008). Implement from the PRD.',
            },
          ],
        },
      ],
    },
  },
  {
    // ADR-0008: the eval harness scores against answer-key files, never generator code.
    files: ['evals/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@reconcile/generator', '@reconcile/generator/*'],
              message: 'Evals read answer keys from disk; they must not import the generator.',
            },
          ],
        },
      ],
    },
  },
  {
    // ADR-0006: the generator must be byte-deterministic from a seed.
    files: ['packages/generator/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng (ADR-0006).' },
        {
          object: 'Date',
          property: 'now',
          message: 'Use the fixed epoch + seeded offsets (ADR-0006).',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: '`new Date()` reads the wall clock. Pass an explicit date (ADR-0006).',
        },
      ],
    },
  },
);
