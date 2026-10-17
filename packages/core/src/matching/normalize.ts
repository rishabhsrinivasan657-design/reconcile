/** Normalization used for grouping and SKU matching. */

export const normalizePo = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');

/** "sp-0123", "SP 123", "SP.123" -> "SP123". Leading zeros of each digit run are dropped. */
export const normalizeSku = (s: string) =>
  s
    .toUpperCase()
    .replace(/[\s\-._/]/g, '')
    .replace(/(^|[A-Z])0+(\d)/g, '$1$2');

export const normalizeVendor = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(inc|llc|co|company|corp|ltd)\b\.?/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const normalizeDocNumber = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function daysBetween(a: string, b: string): number {
  const ms = Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`));
  return Math.round(ms / 86_400_000);
}
