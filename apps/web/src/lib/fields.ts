import { fieldLabel } from './words';

/** The review threshold the extraction uses (packages/extraction DEFAULT_REVIEW_THRESHOLD). */
export const UNSURE_BELOW = 0.8;

export interface FieldRow {
  key: string;
  label: string;
  value: string;
  confidence: number | null;
  page: number;
  /** [x0, y0, x1, y1] as fractions of the page (0–1), as the API stores them. */
  box: [number, number, number, number] | null;
  unsure: boolean;
  money: boolean;
}

const HEADER = ['vendorName', 'docNumber', 'poNumber', 'date', 'dueDate'] as const;
const TOTALS = ['subtotal', 'tax', 'shipping', 'total'] as const;
const LINE = ['description', 'sku', 'qty', 'uom', 'unitPrice', 'lineTotal'] as const;
const MONEY = new Set(['subtotal', 'tax', 'shipping', 'total', 'unitPrice', 'lineTotal']);

type Loc = { page?: number; bbox?: number[] };

/**
 * Turn what the AI read into rows for the document page: header fields, each line's fields, then
 * totals, each with its confidence and its box on the page image (M5 AC-4).
 */
export function fieldRows(
  fields: unknown,
  confidence: Record<string, number>,
  locations: unknown,
): FieldRow[] {
  const f = (fields ?? {}) as Record<string, unknown>;
  const locs = (locations ?? {}) as Record<string, Loc>;
  const rows: FieldRow[] = [];
  const add = (key: string, raw: unknown, name: string) => {
    if (raw === undefined || raw === null || raw === '') return;
    const loc = locs[key];
    const b = loc?.bbox;
    const c = confidence[key];
    rows.push({
      key,
      label: fieldLabel(key),
      value: String(raw),
      confidence: c ?? null,
      page: loc?.page ?? 1,
      box: b && b.length === 4 ? (b as FieldRow['box']) : null,
      unsure: c !== undefined && c < UNSURE_BELOW,
      money: MONEY.has(name),
    });
  };
  for (const k of HEADER) add(k, f[k], k);
  const lines = Array.isArray(f.lines) ? (f.lines as Record<string, unknown>[]) : [];
  lines.forEach((l, i) => {
    for (const k of LINE) add(`lines.${i}.${k}`, l[k], k);
  });
  for (const k of TOTALS) add(k, f[k], k);
  return rows;
}

/** Position a box over the page image, with a little padding so it doesn't sit on the text. */
export function boxStyle(box: [number, number, number, number], pad = 0.004) {
  const [x0, y0, x1, y1] = box;
  const l = Math.max(0, x0 - pad);
  const t = Math.max(0, y0 - pad / 2);
  const r = Math.min(1, x1 + pad);
  const b = Math.min(1, y1 + pad / 2);
  return {
    left: `${(l * 100).toFixed(2)}%`,
    top: `${(t * 100).toFixed(2)}%`,
    width: `${((r - l) * 100).toFixed(2)}%`,
    height: `${((b - t) * 100).toFixed(2)}%`,
  };
}
