import fs from 'node:fs';
import path from 'node:path';
import { GroundTruth, PlantedErrorType } from '@reconcile/core';
import { describe, expect, it } from 'vitest';
import { TEMPLATE_FAMILIES } from '../src/catalog/index.ts';

const evalsDir = path.resolve(import.meta.dirname, '../../../evals');
const subsetFile = path.join(evalsDir, 'ci-subset.json');

describe.skipIf(!fs.existsSync(subsetFile))('committed CI golden subset (AC-17)', () => {
  const { setIds } = JSON.parse(fs.readFileSync(subsetFile, 'utf8')) as { setIds: string[] };
  const truths = setIds.map((id) =>
    GroundTruth.parse(
      JSON.parse(
        fs.readFileSync(path.join(evalsDir, 'golden-ci', id, 'ground_truth.json'), 'utf8'),
      ),
    ),
  );

  it('has 20 sets, each with its files on disk', () => {
    expect(setIds).toHaveLength(20);
    for (const t of truths) {
      for (const d of t.documents) {
        expect(fs.existsSync(path.join(evalsDir, 'golden-ci', t.setId, d.file)), d.file).toBe(true);
      }
    }
  });

  it('covers every planted error type twice and every template once, plus PDF and PNG', () => {
    const planted = truths.flatMap((t) => t.planted.map((p) => p.type));
    for (const type of PlantedErrorType.options) {
      expect(planted.filter((p) => p === type).length, type).toBeGreaterThanOrEqual(2);
    }
    const docs = truths.flatMap((t) => t.documents);
    for (const f of TEMPLATE_FAMILIES)
      expect(
        docs.some((d) => d.template === f),
        f,
      ).toBe(true);
    expect(docs.some((d) => d.format === 'png')).toBe(true);
    expect(docs.some((d) => d.format === 'pdf')).toBe(true);
    expect(truths.some((t) => t.planted.length === 0)).toBe(true);
  });
});
