import { Decimal, toCents } from '../schemas/money.ts';
import type { ExtractedDocument, ExtractedLine } from '../schemas/extracted.ts';
import type { MatchConfig } from './config.ts';
import type { PairLink } from './pair.ts';
import type { LineRef, MatchException } from './types.ts';

/** "$1,234.50" */
export function usd(value: Decimal.Value): string {
  const d = new Decimal(value);
  const [int, frac] = d.abs().toFixed(2).split('.');
  return `${d.isNegative() ? '-' : ''}$${int!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}

const units = (n: number) => `${n} unit${n === 1 ? '' : 's'}`;

export function qtyEqual(a: number, b: number, ordered: number, cfg: MatchConfig): boolean {
  return Math.abs(a - b) <= Math.max(cfg.qtyTolerance.abs, cfg.qtyTolerance.pct * ordered);
}

export function priceEqual(pInv: string, pPo: string, cfg: MatchConfig): boolean {
  const tol = Decimal.max(cfg.priceTolerance.abs, new Decimal(pPo).times(cfg.priceTolerance.pct));
  return new Decimal(pInv).minus(pPo).abs().lessThanOrEqualTo(tol);
}

interface Ctx {
  po: ExtractedDocument;
  rr: ExtractedDocument;
  inv: ExtractedDocument;
  cfg: MatchConfig;
}

function lineTotal(l: ExtractedLine): string {
  return l.lineTotal ?? toCents(new Decimal(l.unitPrice ?? 0).times(l.qty));
}

function shortName(l: ExtractedLine) {
  return `${l.sku ? `${l.sku}, ` : ''}${l.description}`;
}

/**
 * PRD FR-09 for one linked line, with tolerances (M2 AC-4, AC-5). Each billed unit is counted
 * once. Written from the PRD, independently of the generator's answer-key code (ADR-0008).
 */
export function lineExceptions(link: PairLink, ctx: Ctx): MatchException[] {
  const { po, rr, inv, cfg } = ctx;
  const sides = [
    [link.po, po],
    [link.rr, rr],
    [link.inv, inv],
  ] as const;
  const refs: LineRef[] = sides.flatMap(([l, d]) => (l ? [{ docId: d.id, lineNo: l.lineNo }] : []));
  const docIds = sides.flatMap(([l, d]) => (l ? [d.id] : []));
  const base = { lines: refs, documentIds: docIds };

  if (link.inv && !link.po) {
    const amount = lineTotal(link.inv);
    return [
      {
        ...base,
        type: 'UNMATCHED_LINE',
        amount,
        informational: false,
        explanation: `Invoice line ${link.inv.lineNo} (${shortName(link.inv)}) matches nothing on the PO (${usd(amount)}).`,
      },
    ];
  }
  if (!link.po) {
    const l = link.rr!;
    return [
      {
        ...base,
        type: 'UNMATCHED_LINE',
        amount: '0.00',
        informational: true,
        explanation: `Receiving line ${l.lineNo} (${shortName(l)}) matches nothing on the PO.`,
      },
    ];
  }
  if (!link.inv) {
    return [
      {
        ...base,
        type: 'UNMATCHED_LINE',
        amount: '0.00',
        informational: true,
        explanation: `PO line ${link.po.lineNo} (${shortName(link.po)}) was never invoiced.`,
      },
    ];
  }

  const o = link.po.qty;
  const r = link.rr?.qty ?? 0;
  const b = link.inv.qty;
  const pPo = link.po.unitPrice ?? '0';
  const pInv = link.inv.unitPrice ?? '0';
  const price = new Decimal(pInv);
  const out: MatchException[] = [];

  const short = r < o && !qtyEqual(r, o, o, cfg);
  const over = r > o && !qtyEqual(r, o, o, cfg);
  const billedBeyond = b > r && !qtyEqual(b, r, o, cfg);

  if (short) {
    if (billedBeyond) {
      const amount = toCents(price.times(b - r));
      out.push({
        ...base,
        type: 'SHORT_SHIP',
        amount,
        informational: false,
        explanation: `Ordered ${o}, received ${r}, billed ${b} at ${usd(pInv)}: billed for ${units(b - r)} that never arrived (${usd(amount)}).`,
      });
    } else {
      out.push({
        ...base,
        type: 'SHORT_SHIP',
        amount: '0.00',
        informational: true,
        explanation: `Ordered ${o}, received ${r}; the invoice bills only what arrived. No overcharge.`,
      });
    }
  } else if (over) {
    const paidUnordered = Math.min(b, r) - o;
    if (paidUnordered > 0 && !qtyEqual(Math.min(b, r), o, o, cfg)) {
      const amount = toCents(price.times(paidUnordered));
      out.push({
        ...base,
        type: 'OVER_SHIP',
        amount,
        informational: false,
        explanation: `Ordered ${o}, received ${r}, billed ${b} at ${usd(pInv)}: paying for ${units(paidUnordered)} nobody ordered (${usd(amount)}).`,
      });
    } else {
      out.push({
        ...base,
        type: 'OVER_SHIP',
        amount: '0.00',
        informational: true,
        explanation: `Ordered ${o}, received ${r}; the invoice bills only what was ordered. Extra stock arrived unbilled.`,
      });
    }
  }
  if (!short && billedBeyond) {
    const amount = toCents(price.times(b - r));
    out.push({
      ...base,
      type: 'QTY_BILLED_NOT_RECEIVED',
      amount,
      informational: false,
      explanation: `Received ${r}, billed ${b} at ${usd(pInv)}: billed for ${units(b - r)} beyond what arrived (${usd(amount)}).`,
    });
  }
  if (!priceEqual(pInv, pPo, cfg)) {
    const qty = Math.min(b, r);
    const amount = toCents(price.minus(pPo).times(qty));
    const pct = price.minus(pPo).dividedBy(pPo).times(100).toDecimalPlaces(1);
    out.push({
      ...base,
      type: 'PRICE_VARIANCE',
      amount,
      informational: false,
      explanation: `PO price ${usd(pPo)}, invoice ${usd(pInv)} (${pct.isPositive() ? '+' : ''}${pct.toString()}%) on ${units(qty)} received (${usd(amount)}).`,
    });
  }
  return out;
}

const DOC_NAMES = { po: 'purchase order', rr: 'receiving report', invoice: 'invoice' } as const;

export function missingDocument(
  poNumber: string,
  missing: 'po' | 'rr' | 'invoice',
  present: ExtractedDocument[],
  invoice: ExtractedDocument | undefined,
): MatchException {
  const atRisk = missing !== 'invoice' && invoice?.total ? invoice.total : '0.00';
  const why =
    missing === 'rr'
      ? `receipt of the ${usd(atRisk)} invoiced can't be verified`
      : missing === 'po'
        ? `the ${usd(atRisk)} invoice has no authorizing order`
        : 'nothing has been billed yet';
  return {
    type: 'MISSING_DOCUMENT',
    lines: [],
    documentIds: present.map((d) => d.id),
    missing,
    amount: atRisk,
    informational: missing === 'invoice',
    explanation: `No ${DOC_NAMES[missing]} for ${poNumber}: ${why}.`,
  };
}

export function duplicateInvoice(
  dup: ExtractedDocument,
  original: ExtractedDocument,
): MatchException {
  const amount = dup.total ?? '0.00';
  return {
    type: 'DUPLICATE_INVOICE',
    lines: [],
    documentIds: [original.id, dup.id],
    amount,
    informational: false,
    explanation: `Invoice ${dup.docNumber} from ${dup.vendorName} arrived twice (${original.date} and ${dup.date}); second copy ${usd(amount)}.`,
  };
}
