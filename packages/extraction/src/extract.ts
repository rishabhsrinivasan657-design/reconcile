import { createHash } from 'node:crypto';
import { Decimal, ExtractedDocument, type ExtractedLine } from '@reconcile/core';
import type { LlmClient, Usage } from '@reconcile/llm';
import { ExtractionAnswer, type AnswerField } from './answer.ts';
import {
  clamp01,
  convertBox,
  parseIsoDate,
  parseMoney,
  toCentsString,
  toUnitPriceString,
} from './normalize.ts';
import { renderPages, type InputMime } from './pages.ts';
import { EXTRACT_PROMPT } from './prompt.ts';

export interface FieldLocation {
  page: number;
  bbox?: [number, number, number, number];
}

export interface ExtractionResult {
  /** Undefined when required fields (type, vendor, number, date, a line) couldn't be read. */
  document: ExtractedDocument | undefined;
  /** Per-field confidence after math-check adjustments, keyed like "total" or "lines.2.qty". */
  confidence: Record<string, number>;
  locations: Record<string, FieldLocation>;
  needsReview: boolean;
  reviewReasons: string[];
  pages: number;
  llm: {
    usage: Usage;
    costUsd: number | null;
    latencyMs: number;
    cacheHit: boolean;
    model: string;
    provider: string;
  };
}

export const DEFAULT_REVIEW_THRESHOLD = 0.8;
const LINE_TOLERANCE = new Decimal('0.01');
const SUM_TOLERANCE = new Decimal('0.02');

/**
 * Read one document with the LLM, validate, normalize, run math checks, and decide whether a
 * human must review it (M3 AC-5..AC-8).
 */
export async function extractDocument(
  bytes: Uint8Array,
  opts: { llm: LlmClient; id: string; mime: InputMime; reviewThreshold?: number },
): Promise<ExtractionResult> {
  const threshold = opts.reviewThreshold ?? DEFAULT_REVIEW_THRESHOLD;
  const images = await renderPages(bytes, opts.mime);
  const fileHash = createHash('sha256').update(bytes).digest('hex');
  const res = await opts.llm.generateStructured({
    purpose: 'EXTRACT',
    promptVersion: EXTRACT_PROMPT.version,
    system: EXTRACT_PROMPT.system,
    userText: EXTRACT_PROMPT.user(images.length),
    images,
    schema: ExtractionAnswer,
    jsonShape: EXTRACT_PROMPT.jsonShape,
    cacheKeyParts: [fileHash],
    // Output room is shared with hidden "thinking"; one answer was cut off at 8K.
    maxOutputTokens: 16_000,
    documentRef: opts.id,
  });
  let built = buildResult(res.data, opts.id, threshold);
  let usage = res.usage;
  let costUsd = res.costUsd;
  let latencyMs = res.latencyMs;
  let cacheHit = res.cacheHit;

  // Self-check: lines that don't add up to the printed subtotal usually means skipped lines.
  // Ask once more with the evidence; keep the retry only if it actually fixes the totals.
  const gap = missingLinesGap(built);
  if (gap) {
    const retry = await opts.llm.generateStructured({
      purpose: 'EXTRACT',
      promptVersion: `${EXTRACT_PROMPT.version}+${EXTRACT_PROMPT.retryVersion}`,
      system: EXTRACT_PROMPT.system,
      userText: `${EXTRACT_PROMPT.user(images.length)}\n\n${EXTRACT_PROMPT.retry(gap.listed, gap.sum, gap.subtotal)}`,
      images,
      schema: ExtractionAnswer,
      jsonShape: EXTRACT_PROMPT.jsonShape,
      cacheKeyParts: [fileHash, `retry:${gap.listed}:${gap.sum}:${gap.subtotal}`],
      maxOutputTokens: 16_000,
      documentRef: `${opts.id} (self-check)`,
    });
    const second = buildResult(retry.data, opts.id, threshold);
    usage = {
      inputTokens: usage.inputTokens + retry.usage.inputTokens,
      outputTokens: usage.outputTokens + retry.usage.outputTokens,
    };
    costUsd = costUsd === null || retry.costUsd === null ? null : costUsd + retry.costUsd;
    latencyMs += retry.latencyMs;
    cacheHit = cacheHit && retry.cacheHit;
    if (!missingLinesGap(second) && second.document) {
      built = { ...second, reviewReasons: [...second.reviewReasons] };
    } else {
      built.reviewReasons.push('self-check retry did not fix the line totals');
    }
  }

  return {
    ...built,
    pages: images.length,
    llm: { usage, costUsd, latencyMs, cacheHit, model: res.model, provider: res.provider },
  };
}

/** Listed lines sum well below the printed subtotal (lines skipped), with evidence for a retry. */
export function missingLinesGap(
  r: Omit<ExtractionResult, 'pages' | 'llm'>,
): { listed: number; sum: string; subtotal: string } | undefined {
  const d = r.document;
  if (!d?.subtotal || d.lines.length === 0 || d.lines.some((l) => !l.lineTotal)) return undefined;
  const sum = d.lines.reduce((s, l) => s.plus(l.lineTotal!), new Decimal(0));
  const subtotal = new Decimal(d.subtotal);
  // Only clear shortfalls (>2%): small differences are reading errors, not skipped lines.
  if (subtotal.minus(sum).lessThanOrEqualTo(subtotal.times('0.02'))) return undefined;
  return { listed: d.lines.length, sum: toCentsString(sum), subtotal: d.subtotal };
}

/** Pure part of extraction: answer -> document + confidence + checks + review flag. */
export function buildResult(
  a: ExtractionAnswer,
  id: string,
  threshold = DEFAULT_REVIEW_THRESHOLD,
): Omit<ExtractionResult, 'pages' | 'llm'> {
  const confidence: Record<string, number> = {};
  const locations: Record<string, FieldLocation> = {};
  const reasons: string[] = [];
  const take = (key: string, f: AnswerField | ExtractionAnswer['lines'][number]['qty']) => {
    if (f.v === null || f.v === undefined || f.v === '') return;
    confidence[key] = clamp01(f.c);
    const bbox = convertBox(f.b);
    locations[key] = { page: Math.max(1, Math.round(f.p) || 1), ...(bbox ? { bbox } : {}) };
  };
  const text = (key: string, f: AnswerField) => {
    take(key, f);
    const v = typeof f.v === 'string' ? f.v.trim() : '';
    return v || undefined;
  };
  const money = (key: string, f: AnswerField, kind: 'cents' | 'unit') => {
    take(key, f);
    if (f.v === null) return undefined;
    const d = parseMoney(f.v);
    if (!d) {
      reasons.push(`${key}: "${f.v}" is not a valid amount`);
      delete confidence[key];
      return undefined;
    }
    return kind === 'cents' ? toCentsString(d) : toUnitPriceString(d);
  };
  const date = (key: string, f: AnswerField) => {
    take(key, f);
    if (f.v === null) return undefined;
    const d = parseIsoDate(f.v);
    if (!d) {
      reasons.push(`${key}: "${f.v}" is not a real YYYY-MM-DD date`);
      delete confidence[key];
    }
    return d ?? undefined;
  };

  const vendorName = text('vendorName', a.vendorName);
  let docNumber = text('docNumber', a.docNumber);
  let poNumber = text('poNumber', a.poNumber);
  // On a purchase order the PO number *is* the document number; models often put it under
  // poNumber. Move it, and say so, rather than lose the whole document.
  if (a.docType === 'PO' && !docNumber && poNumber) {
    docNumber = poNumber;
    poNumber = undefined;
    if ('poNumber' in confidence) confidence.docNumber = confidence.poNumber!;
    if ('poNumber' in locations) locations.docNumber = locations.poNumber!;
    delete confidence.poNumber;
    delete locations.poNumber;
  }
  const docDate = date('date', a.date);
  const dueDate = date('dueDate', a.dueDate);

  const lines: ExtractedLine[] = [];
  const byAnswerIndex: (ExtractedLine | undefined)[] = [];
  a.lines.forEach((l, i) => {
    const k = (f: string) => `lines.${i}.${f}`;
    const description = text(k('description'), l.description);
    const uom = text(k('uom'), l.uom);
    take(k('qty'), l.qty);
    const qty =
      typeof l.qty.v === 'number' && Number.isInteger(l.qty.v) && l.qty.v >= 0
        ? l.qty.v
        : undefined;
    if (l.qty.v !== null && qty === undefined)
      reasons.push(`${k('qty')}: "${l.qty.v}" is not a whole number`);
    const sku = text(k('sku'), l.sku);
    const unitPrice = money(k('unitPrice'), l.unitPrice, 'unit');
    const lineTotal = money(k('lineTotal'), l.lineTotal, 'cents');
    if (!description || !uom || qty === undefined) {
      reasons.push(`line ${i + 1}: missing description, unit, or quantity`);
      byAnswerIndex.push(undefined);
      return;
    }
    const line: ExtractedLine = {
      lineNo: lines.length + 1,
      ...(sku ? { sku } : {}),
      description,
      qty,
      uom,
      ...(unitPrice ? { unitPrice } : {}),
      ...(lineTotal ? { lineTotal } : {}),
    };
    lines.push(line);
    byAnswerIndex.push(line);
  });
  const subtotal = money('subtotal', a.subtotal, 'cents');
  const tax = money('tax', a.tax, 'cents');
  const shipping = money('shipping', a.shipping, 'cents');
  const total = money('total', a.total, 'cents');

  // ---- math checks: the model's confidence alone isn't trusted (AC-6, AC-7) ----
  const halve = (...keys: string[]) => {
    for (const key of keys) if (key in confidence) confidence[key] = confidence[key]! * 0.5;
  };
  byAnswerIndex.forEach((line, i) => {
    if (!line?.unitPrice || !line.lineTotal) return;
    const expected = new Decimal(line.unitPrice).times(line.qty);
    if (expected.minus(line.lineTotal).abs().greaterThan(LINE_TOLERANCE)) {
      reasons.push(
        `line ${i + 1}: ${line.qty} × ${line.unitPrice} = ${toCentsString(expected)}, but the line total reads ${line.lineTotal}`,
      );
      halve(`lines.${i}.qty`, `lines.${i}.unitPrice`, `lines.${i}.lineTotal`);
    }
  });
  const totals = lines.filter((l) => l.lineTotal).map((l) => new Decimal(l.lineTotal!));
  if (subtotal && totals.length === lines.length && totals.length > 0) {
    const sum = totals.reduce((s, d) => s.plus(d), new Decimal(0));
    if (sum.minus(subtotal).abs().greaterThan(SUM_TOLERANCE)) {
      reasons.push(
        `line totals add up to ${toCentsString(sum)}, but the subtotal reads ${subtotal}`,
      );
      halve('subtotal', ...a.lines.map((_, i) => `lines.${i}.lineTotal`));
    }
  }
  if (subtotal && total) {
    const expected = new Decimal(subtotal).plus(tax ?? 0).plus(shipping ?? 0);
    if (expected.minus(total).abs().greaterThan(SUM_TOLERANCE)) {
      reasons.push(
        `subtotal + tax + shipping = ${toCentsString(expected)}, but the total reads ${total}`,
      );
      halve('subtotal', 'tax', 'shipping', 'total');
    }
  }

  // ---- review flag (AC-8) ----
  const low = Object.entries(confidence)
    .filter(([, c]) => c < threshold)
    .map(([k]) => k);
  if (low.length) reasons.push(`low confidence: ${low.join(', ')}`);

  const candidate = {
    id,
    type: a.docType,
    vendorName,
    docNumber,
    ...(poNumber ? { poNumber } : {}),
    date: docDate,
    ...(dueDate ? { dueDate } : {}),
    lines,
    ...(subtotal ? { subtotal } : {}),
    ...(tax ? { tax } : {}),
    ...(shipping ? { shipping } : {}),
    ...(total ? { total } : {}),
  };
  const parsed = ExtractedDocument.safeParse(candidate);
  if (!parsed.success)
    reasons.push('required fields missing (document type, vendor, number, date, or line items)');

  return {
    document: parsed.success ? parsed.data : undefined,
    confidence,
    locations,
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
  };
}
