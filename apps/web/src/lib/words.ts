/** The words people see for the system's codes (style guide: Writing on screen). */

export type Tone = 'risk' | 'caution' | 'settled' | 'accent' | 'neutral';

export const PROBLEM: Record<string, { label: string; tone: Tone }> = {
  DUPLICATE_INVOICE: { label: 'Duplicate invoice', tone: 'risk' },
  MISSING_DOCUMENT: { label: 'Missing document', tone: 'caution' },
  PRICE_VARIANCE: { label: 'Price over PO', tone: 'risk' },
  QTY_BILLED_NOT_RECEIVED: { label: 'Billed, not received', tone: 'risk' },
  OVER_SHIP: { label: 'Over-shipped', tone: 'caution' },
  UNMATCHED_LINE: { label: 'Line not on PO', tone: 'caution' },
  SHORT_SHIP: { label: 'Short-shipped', tone: 'caution' },
};
export const problemWords = (type: string) =>
  PROBLEM[type] ?? { label: type, tone: 'neutral' as Tone };

export const DECISION: Record<string, { label: string; past: string; tone: Tone }> = {
  APPROVE: { label: 'Approve', past: 'Approved', tone: 'settled' },
  DISPUTE: { label: 'Dispute', past: 'Disputed', tone: 'risk' },
  WRITE_OFF: { label: 'Write off', past: 'Written off', tone: 'neutral' },
};

export const EXCEPTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  OPEN: { label: 'Open', tone: 'caution' },
  APPROVED: { label: 'Approved', tone: 'settled' },
  DISPUTED: { label: 'Disputed', tone: 'risk' },
  WRITTEN_OFF: { label: 'Written off', tone: 'neutral' },
};

export const SET_STATUS: Record<string, { label: string; tone: Tone }> = {
  MATCHED: { label: 'Matched', tone: 'settled' },
  WAITING: { label: 'Waiting for documents', tone: 'neutral' },
  NEEDS_REVIEW: { label: 'Needs review', tone: 'caution' },
};

export const DOC_STATUS: Record<string, { label: string; tone: Tone; step: number }> = {
  UPLOADED: { label: 'Uploaded', tone: 'neutral', step: 1 },
  EXTRACTING: { label: 'Reading', tone: 'accent', step: 2 },
  NEEDS_REVIEW: { label: 'Needs a look', tone: 'caution', step: 3 },
  READY: { label: 'Ready', tone: 'accent', step: 3 },
  MATCHED: { label: 'Matched', tone: 'settled', step: 4 },
  FAILED: { label: "Couldn't read", tone: 'risk', step: 0 },
};

export const DOC_TYPE: Record<string, string> = {
  PO: 'Purchase order',
  RR: 'Receiving report',
  INVOICE: 'Invoice',
};
export const docTypeWords = (t: string | null | undefined) => (t ? (DOC_TYPE[t] ?? t) : 'Document');

export const METHOD: Record<string, { label: string; tone: Tone }> = {
  SKU: { label: 'SKU', tone: 'neutral' },
  FUZZY_LLM: { label: 'Wording', tone: 'neutral' },
  MANUAL: { label: 'By hand', tone: 'neutral' },
};

/** Field labels on the document page, for keys like "total" or "lines.2.qty". */
const FIELD: Record<string, string> = {
  vendorName: 'Vendor',
  docNumber: 'Number',
  poNumber: 'PO number',
  date: 'Date',
  dueDate: 'Due date',
  subtotal: 'Subtotal',
  tax: 'Tax',
  shipping: 'Shipping',
  total: 'Total',
  sku: 'SKU',
  description: 'Item',
  qty: 'Qty',
  uom: 'Unit',
  unitPrice: 'Unit price',
  lineTotal: 'Line total',
};
export function fieldLabel(key: string): string {
  const m = /^lines\.(\d+)\.(\w+)$/.exec(key);
  if (m) return `Line ${Number(m[1]) + 1} · ${(FIELD[m[2]!] ?? m[2]!).toLowerCase()}`;
  return FIELD[key] ?? key;
}

/**
 * How a line pair was made, in plain words. The AI's reasons start with "AI:"; the word matcher's
 * reasons look like "text 0.94; sizes match (12 oz)".
 */
export function pairingReason(
  reason: string | null | undefined,
): { ai: boolean; text: string } | null {
  if (!reason) return null;
  if (reason.startsWith('AI:'))
    return { ai: true, text: `Paired by AI: ${reason.slice(3).trim()}` };
  const score = /text (\d(?:\.\d+)?)/.exec(reason);
  return {
    ai: false,
    text: score
      ? `Paired by similar wording: ${Math.round(Number(score[1]) * 100)}% alike, same size and unit`
      : `Paired by similar wording`,
  };
}
