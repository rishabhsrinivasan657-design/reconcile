import fs from 'node:fs/promises';
import path from 'node:path';
import { GroundTruth, type DocumentFields, type TruthDocument } from '@reconcile/core';
import pkg from '../package.json' with { type: 'json' };
import { buildSet } from './build-set.ts';
import type { Catalog } from './catalog/index.ts';
import type { Rates } from './config.ts';
import type { SetSpec } from './model.ts';
import { renderPdf } from './render/pdf.ts';
import type { Location } from './render/recorder.ts';
import { simulateScan } from './render/scan.ts';
import { Rng } from './rng.ts';
import { expectedExceptions, expectedLineMatches } from './truth.ts';

export const GENERATOR_VERSION = pkg.version;

/** Apply a location transform to every field (used for scans). */
function mapLocations(fields: DocumentFields, fn: (l: Location) => Location): DocumentFields {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if ('bbox' in o && 'page' in o) {
        return { ...o, ...fn({ page: o.page as number, bbox: o.bbox as Location['bbox'] }) };
      }
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(fields) as DocumentFields;
}

export interface GeneratedSet {
  spec: SetSpec;
  truth: GroundTruth;
  files: { name: string; bytes: Buffer }[];
}

/** Build, render, and label one document set in memory. */
export async function generateSet(
  catalog: Catalog,
  rates: Rates,
  seed: number,
  index: number,
): Promise<GeneratedSet> {
  const spec = buildSet(catalog, rates, seed, index);
  const scanRng = new Rng(seed).fork(`scan:${index}`);
  const files: GeneratedSet['files'] = [];
  const documents: TruthDocument[] = [];

  for (const doc of spec.docs) {
    const rendered = await renderPdf(doc);
    const docRng = scanRng.fork(doc.role);
    // Only single-page documents become scans: one PNG per document keeps the answer key simple.
    const scan = rendered.pages === 1 && docRng.chance(rates.scanRate);
    let fields = rendered.fields;
    let name = `${doc.role}.pdf`;
    let bytes = rendered.bytes;
    if (scan) {
      const result = await simulateScan(rendered.bytes, docRng);
      fields = mapLocations(fields, result.transform);
      name = `${doc.role}.png`;
      bytes = result.png;
    }
    files.push({ name, bytes });
    documents.push({
      file: name,
      role: doc.role,
      type: doc.type,
      format: scan ? 'png' : 'pdf',
      template: doc.style.family,
      pages: rendered.pages,
      fields,
    });
  }

  const truth = GroundTruth.parse({
    schemaVersion: 1,
    setId: spec.setId,
    seed,
    generatorVersion: GENERATOR_VERSION,
    poNumber: spec.poNumber,
    vendorCode: spec.vendor.code,
    documents,
    lineMatches: expectedLineMatches(spec),
    exceptions: expectedExceptions(spec),
    planted: spec.planted,
  });
  return { spec, truth, files };
}

/** Write a generated set to `<outDir>/<setId>/`. */
export async function writeSet(outDir: string, set: GeneratedSet): Promise<void> {
  const dir = path.join(outDir, set.truth.setId);
  await fs.mkdir(dir, { recursive: true });
  for (const f of set.files) await fs.writeFile(path.join(dir, f.name), f.bytes);
  await fs.writeFile(
    path.join(dir, 'ground_truth.json'),
    JSON.stringify(set.truth, null, 2) + '\n',
  );
}
