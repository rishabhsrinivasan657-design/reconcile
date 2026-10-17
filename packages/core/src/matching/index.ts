import type { ExtractedDocument } from '../schemas/extracted.ts';
import { resolveMatchConfig, type MatchConfig } from './config.ts';
import { findDuplicates } from './duplicates.ts';
import { duplicateInvoice, lineExceptions, missingDocument } from './exceptions.ts';
import { textSimilarityMatcher } from './fuzzy.ts';
import { groupByPo } from './group.ts';
import { pairLines } from './pair.ts';
import type { FuzzyMatcher, LineMatch, MatchException, MatchGroup, MatchResult } from './types.ts';

export * from './config.ts';
export * from './types.ts';
export { descriptionSimilarity, textSimilarityMatcher, tokenize } from './fuzzy.ts';
export { normalizeSku, normalizePo } from './normalize.ts';
export { usd } from './exceptions.ts';

/**
 * Group documents by PO, detect duplicates, pair lines, and raise FR-09 exceptions with
 * explanations (M2). Pure and deterministic: no I/O (AC-8).
 */
export function matchDocuments(
  docs: readonly ExtractedDocument[],
  opts: { config?: Partial<MatchConfig>; fuzzy?: FuzzyMatcher } = {},
): MatchResult {
  const cfg = resolveMatchConfig(opts.config);
  const fuzzy = opts.fuzzy ?? textSimilarityMatcher;
  const { groups, unassigned } = groupByPo(docs);
  const duplicateOf = findDuplicates(
    docs.filter((d) => d.type === 'INVOICE'),
    cfg.duplicateWindowDays,
  );

  const out: MatchGroup[] = groups.map((g) => {
    const po = g.docs.find((d) => d.type === 'PO');
    const rr = g.docs.find((d) => d.type === 'RR');
    const invoices = g.docs.filter((d) => d.type === 'INVOICE');
    const inv = invoices.find((d) => !duplicateOf.has(d.id));
    const exceptions: MatchException[] = [];
    let lineMatches: LineMatch[] = [];

    for (const d of invoices) {
      const original = duplicateOf.get(d.id);
      if (original) exceptions.push(duplicateInvoice(d, original));
    }

    const missing = [!po && 'po', !rr && 'rr', !inv && 'invoice'].filter(Boolean) as (
      'po' | 'rr' | 'invoice'
    )[];
    if (missing.length > 0) {
      const present = [po, rr, inv].filter((d) => d !== undefined);
      for (const m of missing) exceptions.unshift(missingDocument(g.poNumber, m, present, inv));
    } else {
      const links = pairLines(po!, rr, inv, fuzzy, cfg.fuzzyThreshold);
      lineMatches = links.map((l) => ({
        ...(l.po ? { po: { docId: po!.id, lineNo: l.po.lineNo } } : {}),
        ...(l.rr ? { rr: { docId: rr!.id, lineNo: l.rr.lineNo } } : {}),
        ...(l.inv ? { inv: { docId: inv!.id, lineNo: l.inv.lineNo } } : {}),
        method: l.method,
        ...(l.confidence !== undefined ? { confidence: l.confidence } : {}),
        ...(l.reason !== undefined ? { reason: l.reason } : {}),
      }));
      for (const link of links) {
        exceptions.push(...lineExceptions(link, { po: po!, rr: rr!, inv: inv!, cfg }));
      }
    }

    return {
      poNumber: g.poNumber,
      documents: g.docs.map((d) => ({
        id: d.id,
        role:
          d.type === 'PO'
            ? 'po'
            : d.type === 'RR'
              ? 'rr'
              : duplicateOf.has(d.id)
                ? 'duplicate'
                : 'invoice',
      })),
      lineMatches,
      exceptions,
    };
  });

  return { groups: out, unassigned };
}
