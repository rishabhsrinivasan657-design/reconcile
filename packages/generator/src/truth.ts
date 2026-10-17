import {
  Decimal,
  lineKey,
  toCents,
  type ExceptionType,
  type TruthException,
  type TruthLineMatch,
} from '@reconcile/core';
import type { DocSpec, LineLink, SetSpec } from './model.ts';

/** PRD default price tolerance: prices within max($0.01, 0.5%) count as equal. */
export const PRICE_TOLERANCE = { abs: '0.01', pct: '0.005' } as const;

export interface LineImpact {
  type: ExceptionType;
  amount: string;
  informational: boolean;
}

/**
 * PRD FR-09 for one matched line: each billed unit is counted at most once.
 * o = ordered, r = received, b = billed, pPo / pInv = PO and invoice unit prices.
 *
 * This is the generator's own implementation of the rules (ADR-0008). The M2 matching engine
 * implements them independently, so the two can catch each other's bugs.
 */
export function lineImpacts(
  o: number,
  r: number,
  b: number,
  pPo: string,
  pInv: string,
): LineImpact[] {
  const out: LineImpact[] = [];
  const price = new Decimal(pInv);
  const money = (units: number) => toCents(price.times(units));

  if (r < o) {
    out.push(
      b > r
        ? { type: 'SHORT_SHIP', amount: money(b - r), informational: false }
        : { type: 'SHORT_SHIP', amount: '0.00', informational: true },
    );
  } else if (r > o) {
    const paidUnordered = Math.min(b, r) - o;
    out.push(
      paidUnordered > 0
        ? { type: 'OVER_SHIP', amount: money(paidUnordered), informational: false }
        : { type: 'OVER_SHIP', amount: '0.00', informational: true },
    );
  }
  if (r >= o && b > r) {
    out.push({ type: 'QTY_BILLED_NOT_RECEIVED', amount: money(b - r), informational: false });
  }
  const tolerance = Decimal.max(PRICE_TOLERANCE.abs, new Decimal(pPo).times(PRICE_TOLERANCE.pct));
  if (new Decimal(pInv).minus(pPo).abs().greaterThan(tolerance)) {
    const amount = toCents(new Decimal(pInv).minus(pPo).times(Math.min(b, r)));
    out.push({ type: 'PRICE_VARIANCE', amount, informational: false });
  }
  return out;
}

const doc = (set: SetSpec, role: string): DocSpec | undefined =>
  set.docs.find((d) => d.role === role);

function keys(link: LineLink): string[] {
  return [
    ...(link.po !== undefined ? [lineKey('po', link.po)] : []),
    ...(link.rr !== undefined ? [lineKey('rr', link.rr)] : []),
    ...(link.inv !== undefined ? [lineKey('inv-1', link.inv)] : []),
  ];
}

/** Expected exceptions for a set, derived from how it was constructed, never from a matcher. */
export function expectedExceptions(set: SetSpec): TruthException[] {
  const inv1 = doc(set, 'inv-1');
  const out: TruthException[] = [];

  // An incomplete set can't be 3-way matched: only the missing document is reported.
  if (set.missingRole) {
    const atRisk = set.missingRole === 'inv-1' ? '0.00' : (inv1?.total ?? '0.00');
    out.push({
      type: 'MISSING_DOCUMENT',
      lineKeys: [],
      documentRoles: [set.missingRole],
      amount: atRisk,
      informational: set.missingRole === 'inv-1',
    });
    return out;
  }

  const po = doc(set, 'po')!;
  const rr = doc(set, 'rr')!;
  for (const link of set.links) {
    const poLine = link.po !== undefined ? po.lines[link.po - 1] : undefined;
    const rrLine = link.rr !== undefined ? rr.lines[link.rr - 1] : undefined;
    const invLine = link.inv !== undefined ? inv1!.lines[link.inv - 1] : undefined;
    const roles = [poLine && 'po', rrLine && 'rr', invLine && 'inv-1'].filter(Boolean) as string[];

    if (invLine && !poLine) {
      out.push({
        type: 'UNMATCHED_LINE',
        lineKeys: keys(link),
        documentRoles: roles,
        amount: invLine.lineTotal!,
        informational: false,
      });
      continue;
    }
    if (poLine && !invLine) {
      out.push({
        type: 'UNMATCHED_LINE',
        lineKeys: keys(link),
        documentRoles: roles,
        amount: '0.00',
        informational: true,
      });
      continue;
    }
    if (!poLine || !invLine) continue;
    const impacts = lineImpacts(
      poLine.qty,
      rrLine?.qty ?? 0,
      invLine.qty,
      poLine.unitPrice!,
      invLine.unitPrice!,
    );
    for (const impact of impacts) {
      out.push({ ...impact, lineKeys: keys(link), documentRoles: roles });
    }
  }

  const inv2 = doc(set, 'inv-2');
  if (inv2) {
    out.push({
      type: 'DUPLICATE_INVOICE',
      lineKeys: [],
      documentRoles: ['inv-1', 'inv-2'],
      amount: inv2.total!,
      informational: false,
    });
  }
  return out;
}

export function expectedLineMatches(set: SetSpec): TruthLineMatch[] {
  return set.links.map((l) => ({
    ...(l.po !== undefined ? { po: lineKey('po', l.po) } : {}),
    ...(l.rr !== undefined ? { rr: lineKey('rr', l.rr) } : {}),
    ...(l.inv !== undefined ? { inv: lineKey('inv-1', l.inv) } : {}),
  }));
}
