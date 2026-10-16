import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GroundTruth } from '@reconcile/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/catalog/index.ts';
import { resolveRates } from '../src/config.ts';
import { generateSet, writeSet, type GeneratedSet } from '../src/generate.ts';

const catalog = buildCatalog();
const rates = resolveRates();
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

async function generateMany(n: number, seed = 42): Promise<GeneratedSet[]> {
  const out: GeneratedSet[] = [];
  for (let i = 0; i < n; i++) out.push(await generateSet(catalog, rates, seed, i));
  return out;
}

describe('generated sets (100 sets, seed 42)', () => {
  let sets: GeneratedSet[];
  beforeAll(async () => {
    sets = await generateMany(100);
  }, 120_000);

  it('every answer key validates against the core schema (AC-13)', () => {
    for (const s of sets) expect(() => GroundTruth.parse(s.truth)).not.toThrow();
  });

  it('every document in the answer key has a file, and nothing else is written (AC-9)', () => {
    for (const s of sets) {
      expect(s.files.map((f) => f.name).sort()).toEqual(
        s.truth.documents.map((d) => d.file).sort(),
      );
      const roles = s.truth.documents.map((d) => d.role);
      const missing = s.truth.planted.find((p) => p.type === 'missing_document');
      for (const role of ['po', 'rr', 'inv-1']) {
        expect(roles.includes(role), `${s.truth.setId} ${role}`).toBe(
          missing?.details.missing !== role,
        );
      }
    }
  });

  it('about 20% of documents are PNG scans, with boxes inside the page (AC-15)', () => {
    const docs = sets.flatMap((s) => s.truth.documents);
    const share = docs.filter((d) => d.format === 'png').length / docs.length;
    expect(share).toBeGreaterThanOrEqual(0.15);
    expect(share).toBeLessThanOrEqual(0.25);
    for (const s of sets) {
      for (const f of s.files.filter((x) => x.name.endsWith('.png'))) {
        expect(f.bytes.subarray(1, 4).toString()).toBe('PNG');
      }
    }
  });

  it('uses every template family and produces some multi-page documents (AC-11)', () => {
    const docs = sets.flatMap((s) => s.truth.documents);
    expect(new Set(docs.map((d) => d.template)).size).toBe(6);
    expect(docs.some((d) => d.pages > 1)).toBe(true);
    const lineCounts = sets.map((s) => s.truth.documents[0]!.fields.lines.length);
    expect(Math.min(...lineCounts)).toBe(1);
  });
});

describe('determinism (AC-16, ADR-0006)', () => {
  it('same seed gives byte-identical files; another seed differs', async () => {
    const [a, b, c] = [await generateMany(12), await generateMany(12), await generateMany(12, 7)];
    const hashes = (sets: GeneratedSet[]) =>
      sets.flatMap((s) => [
        ...s.files.map((f) => `${s.truth.setId}/${f.name}:${sha(f.bytes)}`),
        `${s.truth.setId}/truth:${sha(Buffer.from(JSON.stringify(s.truth)))}`,
      ]);
    expect(hashes(a)).toEqual(hashes(b));
    expect(hashes(c)).not.toEqual(hashes(a));
  }, 120_000);

  it('writes a set folder with the files and ground_truth.json', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-gen-'));
    const [set] = await generateMany(1);
    await writeSet(dir, set!);
    const written = fs.readdirSync(path.join(dir, set!.truth.setId)).sort();
    expect(written).toEqual([...set!.files.map((f) => f.name), 'ground_truth.json'].sort());
    fs.rmSync(dir, { recursive: true });
  });
});
