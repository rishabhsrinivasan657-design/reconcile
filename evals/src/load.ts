import fs from 'node:fs';
import path from 'node:path';
import { fromTruthDocument, GroundTruth, type ExtractedDocument } from '@reconcile/core';

export interface LoadedSet {
  truth: GroundTruth;
  docs: ExtractedDocument[];
}

export const evalsDir = path.resolve(import.meta.dirname, '..');

export const SUBSETS = {
  ci: path.join(evalsDir, 'golden-ci'),
  full: path.join(evalsDir, 'golden'),
} as const;
export type Subset = keyof typeof SUBSETS;

/** Document ids carry their set and role ("S0010/inv-1"), so scoring can map them back exactly. */
export const setOf = (docId: string) => docId.split('/')[0]!;
export const roleOf = (docId: string) => docId.split('/')[1]!;

/** Load every answer key in a subset folder and turn its documents into matcher inputs. */
export function loadSubset(dir: string): LoadedSet[] {
  if (!fs.existsSync(dir)) {
    throw new Error(`No golden set at ${dir}. For the full set, run: pnpm generate`);
  }
  return fs
    .readdirSync(dir)
    .filter((d) => /^S\d{4}$/.test(d))
    .sort()
    .map((setId) => {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, setId, 'ground_truth.json'), 'utf8'));
      const truth = GroundTruth.parse(raw);
      return {
        truth,
        docs: truth.documents.map((d) => fromTruthDocument(d, `${setId}/${d.role}`)),
      };
    });
}
